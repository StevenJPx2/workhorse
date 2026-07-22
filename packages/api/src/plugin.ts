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

import type { ToolDefinition } from "@flue/runtime";
import type { Env } from "./types";
import type { TicketRecord } from "./types";

/**
 * A stage tool, authored with flue's `defineTool` in a plugin's tools.ts.
 * Under the flue engine the agent loop runs in the Worker, so a plugin
 * contributes tools as a FACTORY (below) rather than a sandbox-scanned
 * extension.ts — the worker composition root assembles them.
 */
export type WorkhorseTool = ToolDefinition<any, any>;

/**
 * Minimal container handle a tool closes over to reach the workspace.
 * Backed worker-side by the flue SessionEnv (which wraps the Cloudflare
 * Sandbox); tests pass a mock. This is how sandbox-engine tools port —
 * e.g. AFT execs the `aft` CLI, agent-browser execs its daemon, scripts
 * run bash — the tool DEFINITION lives worker-side, the ENGINE runs in
 * the container.
 */
export interface SandboxHandle {
  exec(command: string, opts?: { timeout?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Everything a plugin's tools may close over at assembly time. flue's
 * `run(ctx)` only carries `{ input, signal }`, so anything else a tool
 * needs (core services, the sandbox, the ticket it serves) is captured
 * here when the stage builds its tool registry.
 */
export interface ToolFactoryContext {
  env: Env;
  core: Core;
  /** The workspace container for this run (exec/read/write). */
  sandbox: SandboxHandle;
  /** The ticket + stage the tools serve. */
  ticket: { id: string; repo: string; stage: string };
}

/**
 * A plugin's stage-tool contribution. Returns every tool the plugin
 * offers; the stage engine intersects this with the stage allowlist
 * (spec.tools[]) before exposing any to the agent. Keeping the factory
 * in the plugin (plugins/<name>/tools.ts) is the hard boundary: the
 * worker imports it, the plugin never imports the worker.
 */
export type PluginToolFactory = (ctx: ToolFactoryContext) => WorkhorseTool[];

/** A reference to attachable context, as the operator provides it. */
export interface AttachmentRef {
  /** Provider kind ("repo" | "jira" | "slack" | ...). */
  kind: string;
  /** Canonical id the provider's match() produced (issue key, URL, slug). */
  ref: string;
}

/** Resolved, prompt-ready attachment content. */
export interface ResolvedAttachment {
  title: string;
  /** One-line summary for chips/lists. */
  summary?: string;
  /** Prompt-ready markdown (bounded by the resolver). */
  content: string;
  url?: string;
}

/**
 * A plugin-contributed attachment source: recognizes operator-pasted refs
 * and resolves them into prompt-ready context. Powers the dispatch
 * composer's chips, ticket-page attach, and fleet-chat ref enrichment.
 */
export interface AttachmentProvider {
  kind: string;
  label: string;
  icon?: string;
  /**
   * Recognize a pasted string; return the canonical ref or null.
   * Cheap + synchronous (runs on keystrokes/paste).
   */
  match(input: string): string | null;
  /** Fetch + render the referenced context. Throw on failure. */
  resolve(env: Env, core: Core, ref: string): Promise<ResolvedAttachment>;
}

/** A registered trigger: source + prompt template + workflow + routing. */
export interface TriggerRecord {
  /** ^[a-z][a-z0-9-]{1,63}$ — also the fire-endpoint segment. */
  name: string;
  /** Source kind: "cron" | "webhook" | a plugin TriggerSource kind. */
  source: string;
  /** cron sources: five-field cron expression (UTC). */
  schedule?: string;
  /** Prompt template; {{input}} and {{<field>}} interpolate the payload. */
  template: string;
  workflow?: string;
  repo?: string;
  inputs?: Record<string, string | number | boolean>;
  attachments?: AttachmentRef[];
  enabled: boolean;
  createdAt: string;
  lastFiredAt?: string;
}

/**
 * A plugin-contributed trigger source. Core owns only the plumbing (cron
 * scan + the generic fire endpoint); plugins own how their surface
 * produces a firing (Slack mention, Jira mention, …) and call
 * core.fireTrigger from their webhook handlers.
 */
export interface TriggerSource {
  kind: string;
  describe?: string;
}

/** A registered self-extension script (see the scripts plugin). */
export interface ScriptRecord {
  /** "global" or "repo:<owner/repo>". */
  scope: string;
  name: string;
  description: string;
  /** Shell command body (bash -c). Args arrive as $ARG_<NAME> env vars. */
  command: string;
  args: Array<{ name: string; description?: string; required?: boolean }>;
  /** Ticket statuses allowed to run this script; empty = any. */
  statusGates: string[];
  createdBy: "agent" | "user" | "seed";
  createdAt: string;
  updatedAt: string;
}

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
  /**
   * File a new ticket (repo + prompt → durable staged run). The intake
   * verb for source plugins that ORIGINATE work (Jira, Slack).
   */
  fileTicket(
    body: { repo: string; prompt: string; title?: string; workflow?: string },
  ): Promise<{ ok: true; ticket: TicketRecord } | { ok: false; error: string; status: number }>;
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
   * Queue operator input on the ticket's notification bus. The workflow
   * reads it at its declared read points (stage `notifications: "read"`
   * + all parks); `urgent: true` additionally delivers it into the live
   * session as a steer. THE verb for surface plugins relaying human
   * input — replaces choosing between appendSteer and appendEvents.
   */
  notify(n: {
    ticketId: string;
    source: string;
    kind?: string;
    body: string;
    author?: string;
    urgent?: boolean;
  }): Promise<void>;
  /**
   * Emit a ticket transition signal — the pluggable completion/verdict
   * mechanism. Queues the event and wakes the parked run; the workflow
   * decides which signals it honors at which parks. Kinds the core loops
   * understand today: "accepted" | "changes-requested" | "jira-done"
   * (plus the github plugin's pr-merged/pr-closed via events). Plugins
   * may emit new kinds — unknown kinds park-wake and are consumed as
   * plain events.
   */
  signalTransition(ticketId: string, kind: string, detail?: string): Promise<void>;
  /**
   * Run the fleet-chat agent (a Pi session with workhorse_* tools) over a
   * message history; returns the agent's reply.
   */
  fleetChat(
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ ok: true; reply: string } | { ok: false; error: string; status: number }>;
  /** Scripts visible to a repo (repo-scoped + global, repo wins name clashes). */
  listScripts(repo?: string): Promise<ScriptRecord[]>;
  /** Resolve one script by name (repo scope first, then global). */
  getScriptByName(name: string, repo?: string): Promise<ScriptRecord | null>;
  /** Validate + register/update a script. */
  registerScript(
    s: Omit<ScriptRecord, "createdAt" | "updatedAt">,
  ): Promise<{ ok: true; script: ScriptRecord } | { ok: false; error: string }>;
  /**
   * Fire a registered trigger with a payload (template-interpolated).
   * The verb plugin webhook handlers call when their surface produces a
   * firing (mention, action button, …).
   */
  fireTrigger(
    name: string,
    payload: Record<string, string>,
  ): Promise<{ ok: true; ticket: TicketRecord } | { ok: false; error: string }>;
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
  /** Attachment sources this plugin contributes (kind must be unique fleet-wide). */
  attachments?: AttachmentProvider[];
  /** Trigger sources this plugin can fire (documentation + registry validation). */
  triggers?: TriggerSource[];
  /**
   * Stage tools this plugin contributes (flue engine). The worker assembles
   * these per stage and intersects with the stage allowlist. Replaces the
   * old sandbox-scanned extension.ts — the agent loop now runs in the Worker.
   */
  tools?: PluginToolFactory;
}
