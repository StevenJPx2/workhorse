// Composition root: the ONLY place in the workspace that imports concrete
// plugins. Everything else sees @workhorse/api interfaces.

import { browserPlugin } from "@workhorse/browser";
import { githubPlugin } from "@workhorse/github";
import { imgupPlugin } from "@workhorse/imgup";
import { jiraPlugin } from "@workhorse/jira";
import { scriptsPlugin } from "@workhorse/scripts";
import { searchPlugin } from "@workhorse/search";
import { knowledgePlugin } from "@workhorse/knowledge";
import { ntfyPlugin } from "@workhorse/ntfy";
import { pastePlugin } from "@workhorse/paste";
import { slackPlugin } from "@workhorse/slack";
import { ticketsPlugin } from "@workhorse/tickets";
import type {
  Core,
  Env,
  PluginRoute,
  SandboxHandle,
  TicketRecord,
  ToolContext,
  WorkhorsePlugin,
  WorkhorseTool,
} from "@workhorse/api";
import { appendEvents, appendSteer, wakeTicket } from "./events";
import { runFleetChat } from "./chat";

export const plugins: WorkhorsePlugin[] = [
  browserPlugin,
  githubPlugin,
  imgupPlugin,
  jiraPlugin,
  knowledgePlugin,
  ntfyPlugin,
  pastePlugin,
  scriptsPlugin,
  searchPlugin,
  slackPlugin,
  ticketsPlugin,
];

export function pluginFor(id: string): WorkhorsePlugin | undefined {
  return plugins.find((p) => p.id === id);
}

/**
 * Assemble the stage tool registry (flue engine): every plugin's stage-surface
 * tools, intersected by name with the stage allowlist. This is the (agent ∪
 * services) ∩ stage-allowlist gate expressed in the flue world — a stage sees
 * ONLY the tools its spec names, regardless of what plugins offer. The surface
 * + allowlist filter runs BEFORE instantiation (ToolFactory carries toolName +
 * surfaces), so a tool is built only if it's actually exposed.
 */
export function assembleStageTools(ctx: ToolContext, allow: readonly string[]): WorkhorseTool[] {
  const allowed = new Set(allow);
  const out: WorkhorseTool[] = [];
  const seen = new Set<string>();
  for (const p of plugins) {
    for (const f of p.tools ?? []) {
      if (!f.surfaces.includes("stage") || !allowed.has(f.toolName) || seen.has(f.toolName)) continue;
      seen.add(f.toolName);
      out.push(f(ctx));
    }
  }
  return out;
}

/**
 * Assemble the fleet-chat tool registry: every chat-surface tool across
 * plugins (no allowlist — chat gets its full set). The operator agent uses
 * these to command the fleet (file/list/status/diff) + query knowledge.
 */
export function assembleChatTools(ctx: ToolContext): WorkhorseTool[] {
  const out: WorkhorseTool[] = [];
  const seen = new Set<string>();
  for (const p of plugins) {
    for (const f of p.tools ?? []) {
      if (!f.surfaces.includes("chat") || seen.has(f.toolName)) continue;
      seen.add(f.toolName);
      out.push(f(ctx));
    }
  }
  return out;
}

/** Build a ToolContext for a stage/chat session from its sandbox + ticket. */
export function toolContext(
  env: Env,
  selfOrigin: string,
  sandbox: SandboxHandle,
  ticket: { id: string; repo: string; stage: string },
): ToolContext {
  return { env, core: coreFor(env, selfOrigin), selfOrigin, sandbox, ticket };
}

/** All attachment providers across plugins, keyed by kind. */
export function attachmentProviders() {
  const out = new Map<string, NonNullable<WorkhorsePlugin["attachments"]>[number]>();
  for (const p of plugins) {
    for (const a of p.attachments ?? []) out.set(a.kind, a);
  }
  return out;
}

/** Core services handed to plugin webhooks, routes, and hooks. */
export function coreFor(env: Env, selfOrigin: string): Core {
  return {
    getTicket: async (ticketId) => {
      const { getTicket } = await import("./db");
      return getTicket(env, ticketId);
    },
    listTickets: async (status) => {
      const { listTickets } = await import("./db");
      return listTickets(env, status);
    },
    ticketDiff: async (ticketId) => env.TICKETS.get(`diff:${ticketId}`),
    findWorkflows: async (query, topK) => {
      const { workflowIndex } = await import("./semindex");
      const hits = await workflowIndex.query(env, query.slice(0, 500), { topK: topK ?? 5 });
      return hits.map((h) => {
        const m = (h.metadata ?? {}) as { name?: string; description?: string; stages?: string };
        return { name: m.name ?? h.id, description: m.description, stages: m.stages };
      });
    },
    resolveAttachment: async (kind, ref) => {
      const provider = attachmentProviders().get(kind);
      if (!provider) return null;
      try {
        return await provider.resolve(env, coreFor(env, selfOrigin), ref);
      } catch {
        return null;
      }
    },
    fileTicket: async (body) => {
      const { fileTicket } = await import("./tickets");
      return fileTicket(env, body);
    },
    appendEvents: (events) => appendEvents(env, events),
    wakeTicket: (ticketId) => wakeTicket(env, ticketId),
    appendSteer: (ticketId, message) => appendSteer(env, ticketId, message),
    signalTransition: async (ticketId, kind, detail) => {
      await appendEvents(env, [
        {
          ticketId,
          kind,
          summary: detail ?? `transition signal: ${kind}`,
          receivedAt: new Date().toISOString(),
        },
      ]);
      await wakeTicket(env, ticketId);
    },
    fleetChat: (messages) => runFleetChat(env, selfOrigin, messages),
    listScripts: async (repo) => {
      const { listScripts } = await import("./db");
      return listScripts(env, repo);
    },
    getScriptByName: async (name, repo) => {
      const { getScript } = await import("./db");
      if (repo) {
        const hit = await getScript(env, `repo:${repo}`, name);
        if (hit) return hit;
      }
      return getScript(env, "global", name);
    },
    notify: async (n) => {
      const { notify } = await import("./notifications");
      await notify(env, n);
    },
    fireTrigger: async (name, payload) => {
      const { fireTrigger } = await import("./triggers");
      const r = await fireTrigger(env, name, payload);
      return r.ok ? { ok: true, ticket: r.ticket } : { ok: false, error: r.error };
    },
    registerScript: async (s) => {
      const { validateScript, upsertScript, getScript } = await import("./db");
      const err = validateScript(s);
      if (err) return { ok: false, error: err };
      const now = new Date().toISOString();
      const existing = await getScript(env, s.scope, s.name);
      // Seeded scripts stay pristine: agents/users update their own entries,
      // but a seed is only replaced by an explicit user action.
      if (existing?.createdBy === "seed" && s.createdBy === "agent") {
        return { ok: false, error: `"${s.name}" is a seeded script — copy it under a new name instead` };
      }
      const script = {
        ...s,
        createdBy: existing?.createdBy === "seed" ? existing.createdBy : s.createdBy,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await upsertScript(env, script);
      console.log(`script ${existing ? "updated" : "registered"}: ${s.scope}/${s.name} by ${s.createdBy}`);
      // Semantic discovery: keep the scripts corpus fresh (best-effort).
      const { scriptIndex } = await import("./semindex");
      await scriptIndex.upsert(env, [script]);
      return { ok: true, script };
    },
  };
}

/** Find a plugin route matching this request. */
export function routeFor(method: string, pathname: string): PluginRoute | undefined {
  for (const p of plugins) {
    const r = p.routes?.find((r) => r.method === method && r.path === pathname);
    if (r) return r;
  }
  return undefined;
}

/** Fire a lifecycle hook across all plugins. Best-effort: log + continue. */
export async function fireHook<K extends "onTraceArchived" | "onStatusChange">(
  env: Env,
  selfOrigin: string,
  hook: K,
  info: K extends "onTraceArchived"
    ? {
        ticketId: string;
        runId: string;
        kind: string;
        activityJson: string;
        escalations?: Array<{ trigger: string; detail: string; stage?: string; toModel?: string; at: string }>;
      }
    : { ticketId: string; from: TicketRecord["status"]; to: TicketRecord["status"]; record: TicketRecord },
): Promise<void> {
  const core = coreFor(env, selfOrigin);
  for (const p of plugins) {
    const fn = p.hooks?.[hook];
    if (!fn) continue;
    try {
      // deno-lint-ignore no-explicit-any
      await (fn as (env: Env, core: Core, info: unknown) => Promise<void>)(env, core, info);
    } catch (err) {
      console.warn(`plugin ${p.id} hook ${hook} failed:`, err);
    }
  }
}
