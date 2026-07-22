// Fleet chat runner: a Pi session in a dedicated sandbox armed with the
// workhorse_* tools (file/list/status/diff) + search_fleet_knowledge.
// Shared by the dashboard /chat route and the Slack bot.

import { getSandbox } from "@cloudflare/sandbox";
import type { Env } from "@workhorse/api";

export async function runFleetChat(
  env: Env,
  selfOrigin: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ ok: true; reply: string } | { ok: false; error: string; status: number }> {
  const stored = await env.TICKETS.get("auth:access");
  const auth = stored ? (JSON.parse(stored) as { access: string; expires: number }) : null;
  // Usable unless absent, or expiry is KNOWN (>0) and within 10 min. A zero
  // expiry means the custodian pushed without runway info — treat as usable.
  if (!auth?.access || (auth.expires > 0 && auth.expires - Date.now() < 10 * 60 * 1000)) {
    return { ok: false, error: "no fresh access token (custodian push stale?)", status: 503 };
  }
  const sandbox = getSandbox(env.Sandbox, "fleet-chat", { sleepAfter: "2m" });
  await sandbox.writeFile(
    "/root/.pi/agent/auth.json",
    JSON.stringify({
      anthropic: { type: "oauth", access: auth.access, refresh: "", expires: auth.expires },
    }),
  );
  // Knowledge callback config so search_fleet_knowledge works in chat.
  if (env.SELF_URL && env.BROWSER_TOKEN) {
    await sandbox.writeFile(
      "/root/.workhorse-browser.json",
      JSON.stringify({ url: env.SELF_URL, token: env.BROWSER_TOKEN }),
    );
  }
  const history = messages
    .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
    .join("\n\n");
  const prompt = `You are the Workhorse fleet operator agent, chatting with the user from the fleet dashboard.
You have workhorse_* tools: list tickets, check a ticket's status/diff, and file new tickets (repo + prompt \u2192 autonomous staged run \u2192 GitHub PR).
You also have search_fleet_knowledge: the fleet's institutional memory (distilled traces of every past run — stage analyses, verifier findings, escalations, outcomes). Use it for questions like "why did X fail?", "have we done this before?", or before proposing a fix for a recurring problem.
When the user wants work done, file a ticket. When they ask about progress, use the status tools and report crisply.
Be concise. This is a chat: reply with your message only.\n\nConversation so far:\n${history}\n\nReply to the last user message.`;
  await sandbox.writeFile("/workspace/.chat-prompt", prompt);
  const result = await sandbox.exec(
    `cd /workspace && WORKHORSE_URL=${JSON.stringify(selfOrigin)} WORKHORSE_TOKEN=${JSON.stringify(env.SPIKE_TOKEN)} timeout 180 pi -p -np "$(cat /workspace/.chat-prompt)" 2>&1 | tail -c 4000`,
    { timeout: 200_000 },
  );
  if (result.exitCode !== 0) {
    return { ok: false, error: `chat agent failed: ${result.stdout.slice(-400)}`, status: 500 };
  }
  return { ok: true, reply: result.stdout.trim() };
}
