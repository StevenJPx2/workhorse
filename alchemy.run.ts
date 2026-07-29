// Infrastructure for the Workhorse fleet — NOT THE ACTIVE DEPLOY PATH.
//
// ⚠️  BLOCKED on two Alchemy v2 limitations, both hit on a real prod deploy
//     (2026-07-29) and both verified against the beta's source. `wrangler deploy`
//     remains the deploy path; this file is kept because the research is real and
//     the blockers are upstream-fixable.
//
// BLOCKER 1 — containers cannot attach to a plain Durable Object.
//   v2's `Cloudflare.Container` is Effect-native: it expects to own the class and
//   binds it as a Tag requiring a runtime instance. Our Sandbox is
//   @cloudflare/sandbox's DO with an image attached, so `Container("Sandbox", {…})`
//   fails at plan time with "Service not found: Container<Sandbox>".
//   Binding the DO structurally (below) makes the deploy SUCCEED but silently
//   drops the `containers: [{ className }]` script metadata, which Alchemy
//   collects only from real Container resources. Result: every sandbox call fails
//   with "Containers have not been enabled for this Durable Object class" — a
//   green deploy that breaks every ticket.
//
// BLOCKER 2 — an existing Workflow cannot be adopted by name.
//   For a locally-hosted workflow, WorkerAsyncBindings computes
//   `makeWorkflowName(scriptName, className)` (a sha256-suffixed name) and
//   OVERWRITES whatever name is passed here. The prod deploy created
//   `workhorse-sandbox-ticketworkflow-0aeb8b7a` beside `ticket-workflow` and
//   repointed the binding at it, orphaning every pre-existing instance.
//   Passing `scriptName` does not help — it skips registration but still derives.
//
// WHAT DID WORK, and is worth keeping: D1/KV/R2/Vectorize/AI-Search adoption with
// zero data loss, all 12 secrets preserved across the deploy (measured on a
// throwaway worker first, not assumed), crons, and the Worker Loader binding.
//
// When the blockers lift:
//   bun alchemy deploy --stage prod --adopt    # first time, to adopt
//   bun alchemy deploy --stage prod            # thereafter

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
  dockerfile: "./worker/Dockerfile",
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
