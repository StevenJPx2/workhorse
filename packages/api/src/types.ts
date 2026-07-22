import type { Sandbox } from "@cloudflare/sandbox";

export interface TicketParams {
  /** Ticket id (also the Workflow instance id + sandbox id). */
  id: string;
  /** One-line title for lists. */
  title: string;
  /** Git URL of the repo to work on. */
  repo: string;
  /** The task description given to the agent. */
  prompt: string;
  /**
   * Short-lived Anthropic OAuth ACCESS token minted by the dispatcher
   * (a machine that holds the auto-refreshing auth.json — the MacBook or
   * the laptop). Never a refresh token. Runs are far shorter than the
   * ~5h token lifetime.
   */
  accessToken: string;
  /**
   * Optional model override for the run (evals: compare model X vs Y on
   * the same corpus). Patched into the workspace copy of the workflow
   * spec's defaults.model at prepare; per-stage spec models still win.
   */
  model?: string;
  /**
   * Which baked workflow bundle to run (bundles/workflows/<workflow>).
   * Defaults to "coding". e.g. "screenshot-pr" screenshots a URL, uploads
   * it, and opens a PR embedding the image.
   */
  workflow?: string;
  /**
   * Healing re-dispatch: this instance replaces a dead one for an existing
   * ticket. Resume from the ticket record's recorded progress (branch/PR
   * on GitHub, events + memory in KV) instead of starting from scratch.
   */
  resume?: boolean;
  /** Dispatch-time values for the workflow's declared inputs. */
  inputs?: Record<string, string | number | boolean>;
  /** Context attachments resolved at prepare (plugin-provided). */
  attachments?: Array<{ kind: string; ref: string }>;
}

export interface TicketRecord {
  id: string;
  title: string;
  repo: string;
  prompt: string;
  // Mirrors original Workhorse: done is ONLY set by an external source
  // (PR merged / issue transition) — never by the agent.
  status:
    | "queued"
    | "planning"
    | "implementing"
    | "ready-for-review" // adversarial verifier pass before the PR goes up
    | "awaiting-input" // a stage requested operator input mid-run
    | "in-review"
    | "awaiting-acceptance" // report/artifact outcome offered; operator accepts
    | "done"
    | "errored"
    | "terminated";
  createdAt: string;
  updatedAt: string;
  plan?: string;
  result?: string;
  error?: string;
  branch?: string;
  prUrl?: string;
  runId?: string;
  /** Which baked workflow bundle drives this ticket (default "coding"). */
  workflow?: string;
  /**
   * Current workflow instance driving this ticket. Equals the ticket id
   * for the first instance; healing re-dispatches append -h<n>. All
   * wake/stop/status calls must target this, not the ticket id.
   */
  wfInstance?: string;
  /** How many healing re-dispatches this ticket has consumed. */
  healAttempts?: number;
}

export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  TICKETS: KVNamespace;
  /**
   * D1: the relational plane. Records with relationships — tickets,
   * escalations, trace index, scripts. KV keeps hot small state (live
   * status, cursors, thread mappings, auth token); R2 (future) keeps
   * blobs; AI Search keeps semantic.
   */
  DB: D1Database;
  /**
   * R2: the blob plane — anything too big or too blob-shaped for KV
   * (25 MiB value cap). Trace bodies (trace/<ticket>/<run>.json),
   * oversized Magic Context dbs (mc/<owner/repo>.db), dependency caches
   * (depcache/<owner/repo>/<lockfile-hash>.tar.zst).
   */
  BLOBS: R2Bucket;
  /** Workers AI (embeddings for the semindex toolkit). */
  AI: Ai;
  /** Vectorize: one index, namespaced per corpus (scripts/workflows/tools). */
  VECTORIZE: VectorizeIndex;
  TICKET_WF: Workflow;
  SPIKE_TOKEN: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
  /**
   * Scoped token for the /browser endpoint, injected into ticket sandboxes
   * so untrusted repo code never sees the master SPIKE_TOKEN. Worst case if
   * leaked: someone can read the fleet, not command it.
   */
  BROWSER_TOKEN?: string;
  /**
   * AI Search (AutoRAG) namespace binding — fleet-wide institutional
   * knowledge. One instance ("workhorse-fleet", built-in storage) indexes
   * distilled run traces + ticket outcomes; agents search it before
   * solving ("has the fleet seen this before?").
   */
  AI_SEARCH: AiSearchNamespace;
  /** This Worker's own public URL, so sandboxes can call back to /browser. */
  SELF_URL?: string;
  /**
   * Slack bot (optional — unset disables the Slack surface). Signing secret
   * verifies /webhooks/slack deliveries; bot token posts replies + status
   * updates. Bot needs app_mentions:read, chat:write, and the message.channels
   * event subscription for thread replies.
   */
  SLACK_SIGNING_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  /**
   * Jira (optional — unset disables the Jira surface). Base URL like
   * https://yourorg.atlassian.net; email + API token for outbound
   * transitions/comments; webhook secret required as ?secret= on
   * /webhooks/jira (Atlassian cloud webhooks can't sign requests);
   * agent account (accountId/email/displayName) marks which assignee
   * triggers intake and filters the bot's own comment echoes.
   */
  JIRA_BASE_URL?: string;
  JIRA_EMAIL?: string;
  JIRA_API_TOKEN?: string;
  JIRA_WEBHOOK_SECRET?: string;
  JIRA_AGENT_ACCOUNT?: string;
  /**
   * ntfy push notifications (optional — unset disables). Server base URL
   * (self-hosted or https://ntfy.sh), topic to publish to, optional
   * bearer token for protected topics.
   */
  NTFY_URL?: string;
  NTFY_TOPIC?: string;
  NTFY_TOKEN?: string;
  /** Shared secret for POST /triggers/:name/fire (webhook-style firing). */
  TRIGGER_SECRET?: string;
  /**
   * Web search providers (all optional — unset providers are skipped by
   * the fallback chain). SEARCH_PROVIDER picks the default (tavily|exa|
   * brave); the eval report (evals/) decides which to set.
   */
  SEARCH_PROVIDER?: string;
  JINA_API_KEY?: string;
  TAVILY_API_KEY?: string;
  EXA_API_KEY?: string;
  BRAVE_API_KEY?: string;
}
