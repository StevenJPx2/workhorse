// The Workhorse plugin contract.
//
// A plugin is a vertical capability slice: it may contribute a webhook
// source, worker HTTP routes, lifecycle hooks, and a sandbox-side Pi
// extension (an `extension.ts` next to the plugin's worker code — the
// sandbox image build scans for it; it is NOT part of this interface).
//
// Registration is build-time in the worker package (Workers can't load
// code at runtime) — the decoupling is the interface + package boundary,
// not dynamic loading. Plugins depend ONLY on @workhorse/api; the worker
// is the sole composition point that imports concrete plugins.

import type { Env } from "./types";
import type { TicketRecord } from "./types";

/** One normalized external event tied to a ticket. */
export interface ExternalEvent {
  /** Workhorse ticket id this event belongs to. */
  ticketId: string;
  /** e.g. "pr-review", "pr-comment", "issue-comment", "ci-failed" */
  kind: string;
  /** Human-readable summary injected into the revision prompt. */
  summary: string;
  /** Who triggered it (login/email) — used to ignore the bot's own actions. */
  actor?: string;
  /** Raw source payload subset (JSON-safe primitives), for the agent's reference. */
  detail?: Record<string, string | number | boolean | null | undefined>;
  receivedAt: string;
}

/**
 * Core services plugins may call — implemented by the worker and injected
 * into webhook handlers, routes, and hooks. This is the ONLY way a plugin
 * reaches core behavior; plugins never import the worker package.
 */
export interface Core {
  /** Read a ticket record (null when unknown). */
  getTicket(ticketId: string): Promise<TicketRecord | null>;
  /** Append normalized events to a ticket's KV event list. */
  appendEvents(events: ExternalEvent[]): Promise<void>;
  /**
   * Wake a parked ticket workflow (with retries — safe to call inside
   * ctx.waitUntil; events must already be appended).
   */
  wakeTicket(ticketId: string): Promise<void>;
  /** Queue a mid-run steer for a ticket's LIVE run (picked up next burst). */
  appendSteer(ticketId: string, message: string): Promise<void>;
  /**
   * Run the fleet-chat agent (a Pi session with workhorse_* tools) over a
   * message history; returns the agent's reply.
   */
  fleetChat(
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ ok: true; reply: string } | { ok: false; error: string; status: number }>;
}

/** Webhook half: POST /webhooks/<plugin id>. */
export interface WebhookHandler {
  /**
   * Verify the request's authenticity (signature/secret).
   * Throw or return false to reject.
   */
  verify(request: Request, rawBody: string, env: Env): Promise<boolean>;
  /**
   * Parse a verified payload into zero or more ticket events. Return []
   * for irrelevant deliveries (pings, unrelated repos, bot echo). The
   * worker appends the events and wakes the affected tickets.
   */
  parse?(headers: Headers, payload: unknown, env: Env): Promise<ExternalEvent[]>;
  /**
   * Full request override for sources whose contract exceeds verify+parse
   * (handshake echoes, sub-3s ack with async processing — e.g. Slack).
   * When present, the worker calls ONLY this after verify(); emit events
   * via core yourself and use ctx.waitUntil for slow work.
   */
  handle?(
    request: Request,
    payload: unknown,
    env: Env,
    ctx: ExecutionContext,
    core: Core,
  ): Promise<Response>;
}

/**
 * Auth tier for a plugin route. "scoped": the sandbox-injected scoped token
 * OR the master bearer (for tools called from untrusted sandboxes).
 * "master": fleet master bearer only.
 */
export type RouteAuth = "scoped" | "master";

export interface PluginRoute {
  method: "GET" | "POST";
  /** Exact pathname, e.g. "/browser" or "/knowledge/search". */
  path: string;
  auth: RouteAuth;
  handler(request: Request, env: Env, ctx: ExecutionContext, core: Core): Promise<Response>;
}

/** Lifecycle hooks — fired by core at well-defined points. Best-effort:
 * a throwing hook is logged and never fails the caller. */
export interface PluginHooks {
  /** A run's trace was archived (terminal or PR-up). */
  onTraceArchived?(
    env: Env,
    core: Core,
    info: {
      ticketId: string;
      runId: string;
      kind: string;
      activityJson: string;
      /** Escalation events recorded for this run (fallback/promotion/steer). */
      escalations?: Array<{
        trigger: string;
        detail: string;
        stage?: string;
        toModel?: string;
        at: string;
      }>;
    },
  ): Promise<void>;
  /** A ticket's status changed (old → new, record already persisted). */
  onStatusChange?(
    env: Env,
    core: Core,
    info: { ticketId: string; from: TicketRecord["status"]; to: TicketRecord["status"]; record: TicketRecord },
  ): Promise<void>;
}

export interface WorkhorsePlugin {
  /** Single-word id: webhook URL segment, extension filename, log prefix. */
  id: string;
  webhook?: WebhookHandler;
  routes?: PluginRoute[];
  hooks?: PluginHooks;
}
