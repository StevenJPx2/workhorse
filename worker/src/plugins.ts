// Composition root: the ONLY place in the workspace that imports concrete
// plugins. Everything else sees @workhorse/api interfaces.

import { browserPlugin } from "@workhorse/browser";
import { githubPlugin } from "@workhorse/github";
import { imgupPlugin } from "@workhorse/imgup";
import { knowledgePlugin } from "@workhorse/knowledge";
import { slackPlugin } from "@workhorse/slack";
import { ticketsPlugin } from "@workhorse/tickets";
import type { Core, Env, PluginRoute, TicketRecord, WorkhorsePlugin } from "@workhorse/api";
import { appendEvents, appendSteer, wakeTicket } from "./events";
import { runFleetChat } from "./chat";

export const plugins: WorkhorsePlugin[] = [
  browserPlugin,
  githubPlugin,
  imgupPlugin,
  knowledgePlugin,
  slackPlugin,
  ticketsPlugin,
];

export function pluginFor(id: string): WorkhorsePlugin | undefined {
  return plugins.find((p) => p.id === id);
}

/** Core services handed to plugin webhooks, routes, and hooks. */
export function coreFor(env: Env, selfOrigin: string): Core {
  return {
    appendEvents: (events) => appendEvents(env, events),
    wakeTicket: (ticketId) => wakeTicket(env, ticketId),
    appendSteer: (ticketId, message) => appendSteer(env, ticketId, message),
    fleetChat: (messages) => runFleetChat(env, selfOrigin, messages),
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
    ? { ticketId: string; runId: string; kind: string; activityJson: string }
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
