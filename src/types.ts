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
   * Healing re-dispatch: this instance replaces a dead one for an existing
   * ticket. Resume from the ticket record's recorded progress (branch/PR
   * on GitHub, events + memory in KV) instead of starting from scratch.
   */
  resume?: boolean;
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
    | "in-review"
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
  TICKET_WF: Workflow;
  SPIKE_TOKEN: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
}
