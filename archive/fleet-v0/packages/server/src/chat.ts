// Fleet chat runner: the operator agent, run as an in-process pi session in
// the Worker (same engine as a stage — no subprocess). It's armed with the
// plugins' chat-surface tools (workhorse_* fleet ops + search_fleet_knowledge),
// assembled the same way stages assemble their stage-surface tools. Shared by
// the dashboard /chat route and the Slack bot.
//
// A lightweight `fleet-chat` container backs the ToolContext for uniformity,
// but the chat tools are all Core/HTTP calls and never exec in it.

import { piSession, toPiTool } from "@workhorse/pi";
import type { AgentExtension, Core, Env } from "@workhorse/api";
import { sandboxDriver } from "@workhorse/sandbox";
import type { WorkhorseTool } from "@workhorse/api";
import { toolContext } from "./tool-context";

/** Assembles the chat tool surface — injected, since it reads the plugin registry. */
type AssembleChatTools = (ctx: import("@workhorse/api").ToolContext) => WorkhorseTool[];

/** Assembles the chat extension surface — injected alongside the tools. */
type AgentExtensionsAssembler = (ctx: import("@workhorse/api").ToolContext) => AgentExtension[];

const SYSTEM = `You are the Workhorse fleet operator agent, chatting with the user from the fleet dashboard.
You have workhorse_* tools: list tickets, check a ticket's status/diff, and file new tickets (repo + prompt → autonomous staged run → GitHub PR). Call workhorse_find_workflow to pick the workflow that fits a task before filing.
You also have search_fleet_knowledge: the fleet's institutional memory (distilled traces of every past run — stage analyses, verifier findings, escalations, outcomes). Use it for questions like "why did X fail?", "have we done this before?", or before proposing a fix for a recurring problem.
When the user wants work done, file a ticket. When they ask about progress, use the status tools and report crisply.
Be concise. This is a chat: reply with your message only.`;

/** Fleet chat runs in ONE shared container, not a per-ticket sandbox. */
const SANDBOX_ID = "fleet-chat";

// fallow-ignore-next-line complexity
export async function runFleetChat(
  env: Env,
  core: Core,
  selfOrigin: string,
  messages: Array<{ role: string; content: string }>,
  assembleChatTools: AssembleChatTools,
  assembleChatExtensions: AgentExtensionsAssembler,
): Promise<{ ok: true; reply: string } | { ok: false; error: string; status: number }> {
  if (!env.OPENCODE_API_KEY) {
    return { ok: false, error: "OPENCODE_API_KEY not set", status: 503 };
  }

  const sandbox = sandboxDriver(env, SANDBOX_ID);
  const ctx = toolContext(env, core, selfOrigin, sandbox, { id: "chat", repo: "", stage: "chat" });

  try {
    const session = await chatSession(env, env.OPENCODE_API_KEY, assembleChatTools(ctx), assembleChatExtensions(ctx));
    try {
      await session.prompt(renderPrompt(messages));
      const reply = lastAssistantText(session).trim();
      return reply ? { ok: true, reply } : { ok: false, error: "empty reply from fleet agent", status: 502 };
    } finally {
      session.dispose();
    }
  } catch (e) {
    return { ok: false, error: `chat agent failed: ${String((e as Error)?.message ?? e).slice(0, 400)}`, status: 500 };
  }
}

/** Last assistant text from the session transcript (pi's prompt resolves to void). */
// fallow-ignore-next-line complexity
function lastAssistantText(session: { state: { messages: Array<{ role: string; content?: unknown }> } }): string {
  const msgs = session.state.messages;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "assistant") continue;
    const c = m.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const text = c.map(partText).join("");
      if (text) return text;
    }
  }
  return "";
}

/** Extract the text payload of one content part (pi content arrays mix types). */
// fallow-ignore-next-line complexity
function partText(p: unknown): string {
  if (!p || typeof p !== "object") return "";
  const part = p as { type?: string; text?: string };
  return part.type === "text" ? part.text ?? "" : "";
}

/** Render the conversation as the single prompt the operator agent receives. */
function renderPrompt(messages: Array<{ role: string; content: string }>): string {
  const history = messages.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n\n");
  return `Conversation so far:\n${history}\n\nReply to the last user message.`;
}

/** Stand up one pi session for the operator agent. */
async function chatSession(env: Env, apiKey: string, tools: WorkhorseTool[], extensions: AgentExtension[]) {
  const names = tools.map((t) => t.name);
  const session = await piSession({
    apiKey,
    persona: SYSTEM,
    customTools: tools.map(toPiTool),
    tools: names,
    activateRegisteredTools: true,
    extensions,
  });
  return session;
}
