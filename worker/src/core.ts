// The Core facade: the services a plugin gets in its webhooks, routes, and hooks.
//
// Separate from ./registry (the plugin list) because this half legitimately reaches
// across the worker — tickets, chat, events, the semantic index — and a module that
// both holds the plugin list AND calls into those modules is what created five
// import cycles.

import { appendEvents, appendSteer, wakeTicket } from "@workhorse/events";
import type { Core, Env, TicketRecord } from "@workhorse/api";
import { db, validateScript } from "@workhorse/db";
import { runFleetChat } from "@workhorse/server";
import { assembleChatTools, attachmentProviders, plugins } from "./registry";

/**
 * Register or update a self-extension script.
 *
 * Extracted from the facade because it is the only Core service with real policy
 * in it: validation, seed protection, provenance preservation, and index upkeep.
 * Inline, it made `coreFor` the most complex function in the worker.
 */
async function registerScript(
  env: Env,
  draft: Parameters<Core["registerScript"]>[0],
): Promise<Awaited<ReturnType<Core["registerScript"]>>> {
  const err = validateScript(draft);
  if (err) return { ok: false, error: err };

  const existing = await db(env).scripts.get(draft.scope, draft.name);

  // Seeded scripts stay pristine: agents and users update their own entries, but a
  // seed is only replaced by an explicit user action.
  if (existing?.createdBy === "seed" && draft.createdBy === "agent") {
    return { ok: false, error: `"${draft.name}" is a seeded script — copy it under a new name instead` };
  }

  const now = new Date().toISOString();
  const script = {
    ...draft,
    // Provenance survives a rewrite: who first created it, and when.
    createdBy: existing?.createdBy === "seed" ? existing.createdBy : draft.createdBy,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db(env).scripts.upsert(script);
  console.log(`script ${existing ? "updated" : "registered"}: ${draft.scope}/${draft.name} by ${draft.createdBy}`);

  // Semantic discovery: keep the scripts corpus fresh. Best-effort — a failed
  // index update must not undo a successful registration.
  try {
    const { scriptIndex } = await import("@workhorse/server");
    await scriptIndex.upsert(env, [script]);
  } catch (indexErr) {
    console.warn(`script index update failed for ${draft.scope}/${draft.name}:`, indexErr);
  }

  return { ok: true, script };
}

/** Core services handed to plugin webhooks, routes, and hooks. */
export function coreFor(env: Env, selfOrigin: string): Core {
  const core: Core = {
    getTicket: (ticketId) => db(env).tickets.get(ticketId),
    listTickets: (status) => db(env).tickets.list(status),
    ticketDiff: async (ticketId) => env.TICKETS.get(`diff:${ticketId}`),
    findWorkflows: async (query, topK) => {
      const { workflowIndex } = await import("@workhorse/server");
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
      const { intake } = await import("./intake");
      return intake.fileTicket(env, body);
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
    // Hands chat the facade being built rather than making chat import it — the
    // inversion that removes the core <-> chat cycle.
    fleetChat: (messages) => runFleetChat(env, core, selfOrigin, messages, assembleChatTools),
    listScripts: (repo) => db(env).scripts.list(repo),
    getScriptByName: async (name, repo) => {
      // repo scope shadows global for the same name.
      if (repo) {
        const hit = await db(env).scripts.get(`repo:${repo}`, name);
        if (hit) return hit;
      }
      return db(env).scripts.get("global", name);
    },
    notify: async (n) => {
      const { notify } = await import("@workhorse/events");
      await notify(env, n);
    },
    fireTrigger: async (name, payload) => {
      const { fireTrigger } = await import("@workhorse/server");
      const { intake } = await import("./intake");
      const r = await fireTrigger(intake, env, name, payload);
      return r.ok ? { ok: true, ticket: r.ticket } : { ok: false, error: r.error };
    },
    registerScript: (s) => registerScript(env, s),
  };

  return core;
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
