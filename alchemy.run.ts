// Infrastructure for the Workhorse fleet.
//
// Replaces worker/wrangler.jsonc. Every resource here ALREADY EXISTS in the
// account — this stack adopts them rather than provisioning a parallel set, so
// each one passes the explicit name it is deployed under. Alchemy's default
// physical name is `{app}-{stage}-{logical-id}`, which would create a second
// empty D1 beside the one holding 47 tickets.
//
// First deploy against existing infrastructure needs `--adopt`:
//
//   bun alchemy deploy --stage prod --adopt
//
// After that the state store knows about them and plain `deploy` suffices.

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type { TicketWorkflow as TicketWorkflowClass } from "./worker/src/ticket-workflow.ts";

/** The deployed worker name. Not derived — it predates this stack. */
const WORKER_NAME = "workhorse-sandbox";

/**
 * The relational plane: tickets, escalations, traces, scripts, notifications.
 *
 * `migrationsTable` matches the ledger wrangler created in Phase 1, so Alchemy
 * reads the same applied-migration history rather than replaying `0000_baseline`
 * against tables that already exist.
 */
export const DB = Cloudflare.D1.Database("DB", {
  name: "workhorse",
  migrationsDir: "./worker/migrations",
  migrationsTable: "drizzle_migrations",
});

/**
 * Hot small state: live snapshots, event/steer logs, the model access token.
 *
 * The title is literally "TICKETS" — verified against the account, not guessed.
 * A wrong title here does not fail: Alchemy creates a SECOND, empty namespace
 * and binds it, silently orphaning every live key.
 */
export const TICKETS = Cloudflare.KV.Namespace("TICKETS", {
  title: "TICKETS",
});

/** The blob plane: trace bodies and dependency caches. */
export const BLOBS = Cloudflare.R2.Bucket("BLOBS", {
  name: "workhorse-blobs",
});

/** One index, namespaced per corpus (scripts / workflows / tools). */
export const VECTORIZE = Cloudflare.Vectorize.Index("VECTORIZE", {
  name: "workhorse-semindex",
});

/**
 * Fleet knowledge + per-repo agent memory, in one AI Search instance.
 *
 * The `workhorse-fleet` instance id is created on first use by the knowledge
 * plugin, not here — this binds the NAMESPACE the plugin's `.get(id)` resolves
 * against, matching the `ai_search_namespaces` binding it replaces.
 */
export const AI_SEARCH = Cloudflare.AI.SearchNamespace("AI_SEARCH", {
  name: "default",
});

/**
 * The per-ticket container: cloned repo + tool exec.
 *
 * `context` is the repo root because the image build scans `plugins/` — the same
 * reason wrangler set `image_build_context: ".."`.
 */
/** The DO namespace the container attaches to. Ref form: the class ships in the worker. */
export const SandboxNamespace = { kind: "Cloudflare.DurableObject", name: "Sandbox", className: "Sandbox" } as const;

export const Sandbox = Cloudflare.Container("Sandbox", {
  context: import.meta.dirname,
  dockerfile: "./sandbox/Dockerfile",
  instanceType: "standard-1",
  maxInstances: 5,
});

/**
 * One durable instance per ticket: dispatch, drive, parks, delivery.
 *
 * The ref form (name + className), not the Effect form — the class is a plain
 * `WorkflowEntrypoint` exported from the worker, not an Alchemy-native workflow.
 */
export const TICKET_WF = Cloudflare.Workflows.Workflow<TicketWorkflowClass>("ticket-workflow", {
  className: "TicketWorkflow",
});

export const Worker = Cloudflare.Worker("Worker", {
  name: WORKER_NAME,
  main: "./worker/src/index.ts",

  // One object in v2, not two flat props.
  compatibility: { date: "2026-03-27", flags: ["nodejs_compat"] },

  // Self-healing sweep + cron trigger dispatch.
  crons: ["*/15 * * * *"],

  observability: { enabled: true },

  env: {
    DB,
    TICKETS,
    BLOBS,
    VECTORIZE,
    AI_SEARCH,
    // The container image attaches to this DO namespace (see Sandbox below).
    Sandbox: SandboxNamespace,
    TICKET_WF,

    /** Workers AI: embeddings for the semantic index. */
    AI: Cloudflare.Workers.AI(),

    /**
     * Code Mode: the agent writes ONE program that chains tools inside a
     * disposable dynamic worker with no network.
     */
    LOADER: Cloudflare.Workers.WorkerLoader(),

    /**
     * This Worker's own public URL, so ticket sandboxes can call back into it.
     *
     * A literal rather than a self-reference: the value is the workers.dev
     * hostname the fleet already advertises, and the sandboxes' injected config
     * points at it.
     */
    SELF_URL: `https://${WORKER_NAME}.stevenjpx2.workers.dev`,
  },
});

// NOTE: `Cloudflare.InferEnv<typeof Worker>` collapses to an index signature
// here rather than named keys, so it cannot be used to verify the worker's `Env`
// against these bindings. `@workhorse/api`'s hand-written `Env` stays the source
// of truth; the check that they agree is the deploy itself, which fails on a
// binding the code reads and this stack does not declare.

export default Alchemy.Stack(
  "workhorse",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const worker = yield* Worker;

    return { url: worker.url };
  }),
);
