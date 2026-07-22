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
  ToolFactoryContext,
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
 * Assemble the stage tool registry (flue engine): every plugin's tools(ctx),
 * intersected by name with the stage allowlist. This is the (agent ∪
 * services) ∩ stage-allowlist gate expressed in the flue world — a stage
 * sees ONLY the tools its spec names, regardless of what plugins offer.
 *
 * `allow` is the stage spec's tools[] (bare names). Unknown names are
 * ignored (the workflow validator flags them at upload time). Returns the
 * flue ToolDefinition[] to attach to the stage agent.
 */
export function assembleStageTools(ctx: ToolFactoryContext, allow: readonly string[]): WorkhorseTool[] {
  const allowed = new Set(allow);
  const out: WorkhorseTool[] = [];
  const seen = new Set<string>();
  for (const p of plugins) {
    if (!p.tools) continue;
    for (const tool of p.tools(ctx)) {
      if (!allowed.has(tool.name) || seen.has(tool.name)) continue;
      seen.add(tool.name);
      out.push(tool);
    }
  }
  return out;
}

/** Build a ToolFactoryContext for a stage from its sandbox + ticket. */
export function toolContext(
  env: Env,
  selfOrigin: string,
  sandbox: SandboxHandle,
  ticket: { id: string; repo: string; stage: string },
): ToolFactoryContext {
  return { env, core: coreFor(env, selfOrigin), sandbox, ticket };
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
