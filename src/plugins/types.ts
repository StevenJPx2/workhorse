// Source-plugin contract — the Cloudflare-native heir of legacy Workhorse's
// plugin system. Core knows NOTHING about GitHub/Jira specifics: it routes
// POST /webhooks/:source to the matching plugin, stores the events the
// plugin extracts, and wakes the parked ticket workflow.
//
// (Workers can't load code at runtime, so plugins register at build time in
// plugins/index.ts — the decoupling is the interface, not dynamic loading.)

import type { Env } from "../types";

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

export interface SourcePlugin {
  /** URL segment: POST /webhooks/<id> */
  id: string;
  /**
   * Verify the webhook request's authenticity (signature/secret).
   * Throw or return false to reject.
   */
  verify(request: Request, rawBody: string, env: Env): Promise<boolean>;
  /**
   * Parse a verified webhook payload into zero or more ticket events.
   * Return [] for irrelevant deliveries (pings, unrelated repos, bot echo).
   * May consult KV to resolve ticket associations.
   */
  parse(headers: Headers, payload: unknown, env: Env): Promise<ExternalEvent[]>;
  /**
   * Full request override for sources whose webhook contract exceeds
   * verify+parse (handshake echoes, sub-3s ack with async processing —
   * e.g. Slack's url_verification + Events API). When present, the route
   * calls ONLY this after verify(); parse is skipped. Emit ticket events
   * yourself (appendEvents) and use ctx.waitUntil for slow work.
   */
  handle?(request: Request, payload: unknown, env: Env, ctx: ExecutionContext): Promise<Response>;
}
