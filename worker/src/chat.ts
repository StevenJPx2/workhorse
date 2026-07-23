// Fleet chat runner: the operator agent, run as an in-process flue harness in
// the Worker (same engine as a stage — no Pi subprocess). It's armed with the
// plugins' chat-surface tools (workhorse_* fleet ops + search_fleet_knowledge),
// assembled the same way stages assemble their stage-surface tools. Shared by
// the dashboard /chat route and the Slack bot.
//
// A lightweight `fleet-chat` container backs the ToolContext for uniformity,
// but the chat tools are all Core/HTTP calls and never exec in it.

import { getSandbox } from "@cloudflare/sandbox";
import { defineAgent, registerProvider } from "@flue/runtime";
import { cloudflareSandbox } from "@flue/runtime/cloudflare";
import { createFlueContext, resolveModel } from "@flue/runtime/internal";
import type { Env } from "@workhorse/api";
import { sandboxDriver } from "./agent-run";
import { assembleChatTools, toolContext } from "./plugins";

const SYSTEM = `You are the Workhorse fleet operator agent, chatting with the user from the fleet dashboard.
You have workhorse_* tools: list tickets, check a ticket's status/diff, and file new tickets (repo + prompt → autonomous staged run → GitHub PR). Call workhorse_find_workflow to pick the workflow that fits a task before filing.
You also have search_fleet_knowledge: the fleet's institutional memory (distilled traces of every past run — stage analyses, verifier findings, escalations, outcomes). Use it for questions like "why did X fail?", "have we done this before?", or before proposing a fix for a recurring problem.
When the user wants work done, file a ticket. When they ask about progress, use the status tools and report crisply.
Be concise. This is a chat: reply with your message only.`;

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

  const sandboxId = "fleet-chat";
  const sandbox = sandboxDriver(env, sandboxId);
  const ctx = toolContext(env, selfOrigin, sandbox, { id: "chat", repo: "", stage: "chat" });
  const tools = assembleChatTools(ctx);

  const history = messages
    .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
    .join("\n\n");
  const prompt = `Conversation so far:\n${history}\n\nReply to the last user message.`;

  const model = "anthropic/claude-sonnet-4-6";
  registerProvider("anthropic", { apiKey: auth.access });
  const agent = defineAgent(() => ({
    model,
    instructions: SYSTEM,
    tools,
    sandbox: { ...cloudflareSandbox(getSandbox(env.Sandbox, sandboxId) as never, { cwd: "/workspace" }), tools: () => [] },
  }));
  const flueCtx = createFlueContext({
    id: sandboxId,
    env: {},
    agentConfig: { resolveModel: () => resolveModel(model) },
    createDefaultEnv: async () => {
      throw new Error("no default env — fleet chat supplies a sandbox factory");
    },
  });

  try {
    const harness = await flueCtx.initializeRootHarness(agent);
    const session = await harness.session();
    const res = (await session.prompt(prompt)) as { text?: string };
    const reply = (res.text ?? "").trim();
    return reply ? { ok: true, reply } : { ok: false, error: "empty reply from fleet agent", status: 502 };
  } catch (e) {
    return { ok: false, error: `chat agent failed: ${String((e as Error)?.message ?? e).slice(0, 400)}`, status: 500 };
  }
}
