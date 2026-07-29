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
import type { Core, Env } from "@workhorse/api";
import { START_RUNWAY_MS } from "@workhorse/auth";
import { sandboxDriver } from "./agent-run";
import { modelToken } from "./auth";
import { assembleChatTools } from "./registry";
import { toolContext } from "./tool-context";

const SYSTEM = `You are the Workhorse fleet operator agent, chatting with the user from the fleet dashboard.
You have workhorse_* tools: list tickets, check a ticket's status/diff, and file new tickets (repo + prompt → autonomous staged run → GitHub PR). Call workhorse_find_workflow to pick the workflow that fits a task before filing.
You also have search_fleet_knowledge: the fleet's institutional memory (distilled traces of every past run — stage analyses, verifier findings, escalations, outcomes). Use it for questions like "why did X fail?", "have we done this before?", or before proposing a fix for a recurring problem.
When the user wants work done, file a ticket. When they ask about progress, use the status tools and report crisply.
Be concise. This is a chat: reply with your message only.`;

/** Fleet chat runs in ONE shared container, not a per-ticket sandbox. */
const SANDBOX_ID = "fleet-chat";

const MODEL = "anthropic/claude-sonnet-4-6";

export async function runFleetChat(
  env: Env,
  core: Core,
  selfOrigin: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ ok: true; reply: string } | { ok: false; error: string; status: number }> {
  const token = await modelToken(env).usable(START_RUNWAY_MS);
  if (!token) {
    return { ok: false, error: "no fresh access token (custodian push stale?)", status: 503 };
  }

  const sandbox = sandboxDriver(env, SANDBOX_ID);
  const ctx = toolContext(env, core, selfOrigin, sandbox, { id: "chat", repo: "", stage: "chat" });

  try {
    const session = await chatSession(env, token, assembleChatTools(ctx));
    const res = (await session.prompt(renderPrompt(messages))) as { text?: string };
    const reply = (res.text ?? "").trim();

    return reply ? { ok: true, reply } : { ok: false, error: "empty reply from fleet agent", status: 502 };
  } catch (e) {
    return { ok: false, error: `chat agent failed: ${String((e as Error)?.message ?? e).slice(0, 400)}`, status: 500 };
  }
}

/** Render the conversation as the single prompt the operator agent receives. */
function renderPrompt(messages: Array<{ role: string; content: string }>): string {
  const history = messages.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n\n");
  return `Conversation so far:\n${history}\n\nReply to the last user message.`;
}

/** Stand up one flue harness session for the operator agent. */
async function chatSession(env: Env, token: string, tools: ReturnType<typeof assembleChatTools>) {
  registerProvider("anthropic", { apiKey: token });

  const agent = defineAgent(() => ({
    model: MODEL,
    instructions: SYSTEM,
    tools,
    // tools: () => [] on the sandbox: the container is for exec only. Chat's tools
    // are the plugin ones assembled above, not flue's own sandbox surface.
    sandbox: {
      ...cloudflareSandbox(getSandbox(env.Sandbox, SANDBOX_ID) as never, { cwd: "/workspace" }),
      tools: () => [],
    },
  }));

  const flueCtx = createFlueContext({
    id: SANDBOX_ID,
    env: {},
    agentConfig: { resolveModel: () => resolveModel(MODEL) },
    createDefaultEnv: async () => {
      throw new Error("no default env — fleet chat supplies a sandbox factory");
    },
  });

  const harness = await flueCtx.initializeRootHarness(agent);
  return harness.session();
}
