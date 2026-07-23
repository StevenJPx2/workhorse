import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import {
  injectAuth,
  injectBrowserConfig,
  injectTicketContext,
  restoreDepCache,
  saveDepCache,
  prepareWorkspace,
  deliverBranch,
  checkoutTicketBranch,
  restoreMemory,
  persistMemory,
} from "./agent-run";
import { workflowDef } from "@workhorse/workflow";
import { runWorkflowDef, type DefRunResult } from "./workflow-run";
import { unconsumedEvents, consumeEvents } from "./events";
import { fireHook } from "./plugins";
import { getTicket, insertEscalation, insertTraceIndex, patchTicket } from "./db";
import type { Env, ExternalEvent, TicketParams, TicketRecord } from "@workhorse/api";

async function updateTicket(env: Env, id: string, patch: Partial<TicketRecord>) {
  const r = await patchTicket(env, id, patch);
  if (!r) return;
  // Lifecycle hook: plugins react to transitions (e.g. slack posts into
  // the ticket's thread). Best-effort by contract.
  if (patch.status && patch.status !== r.prev.status) {
    await fireHook(env, env.SELF_URL ?? "", "onStatusChange", {
      ticketId: id,
      from: r.prev.status,
      to: patch.status,
      record: r.next,
    });
  }
}

/** How many external wake→revise cycles a ticket may go through. */
const MAX_REVISIONS = 20;

/**
 * Freshest access token available. The token in the workflow payload is
 * frozen at filing time and lives ~5h — any step that can run later
 * (parks, long drives, revisions days after filing) MUST use the
 * custodian-pushed token from KV instead.
 */
async function freshToken(env: Env, fallback: string): Promise<string> {
  const stored = await env.TICKETS.get("auth:access");
  if (stored) {
    const parsed = JSON.parse(stored) as { access: string; expires: number };
    if (parsed.expires - Date.now() > 5 * 60 * 1000) return parsed.access;
  }
  return fallback;
}

/** Live observability snapshot pushed to KV after every phase/burst. */
async function setLive(env: Env, ticketId: string, live: Record<string, unknown>): Promise<void> {
  await env.TICKETS.put(`live:${ticketId}`, JSON.stringify({ ...live, at: new Date().toISOString() }));
}

/**
 * One escalation event on a run: an availability fallback (credential leg
 * switch) or a capability promotion (stage re-run one model up). Appended
 * to esc:<ticket>:<run> as it happens; merged into the trace archive so
 * evals can mine which stages genuinely need a bigger model.
 */
interface EscalationEvent {
  at: string;
  trigger: "fallback" | "promotion" | "steer";
  detail: string;
  /** Promotion only: which stage delegated + the model movement. */
  stage?: string;
  fromModel?: string;
  toModel?: string;
}

async function recordEscalation(
  env: Env,
  ticketId: string,
  runId: string,
  event: Omit<EscalationEvent, "at">,
): Promise<void> {
  await insertEscalation(env, {
    ticketId,
    runId,
    trigger: event.trigger,
    detail: event.detail,
    stage: event.stage,
    toModel: event.toModel,
    at: new Date().toISOString(),
  });
}

/**
 * Durable trace archive for optimization mining + evals: one immutable
 * record per engine run (activity:<id> is a "latest" pointer that gets
 * overwritten each revision; traces never are). Key: trace:<ticket>:<run>.
 * Also maintains a per-ticket run index at traces:<ticket>.
 */
async function archiveTrace(
  env: Env,
  ticketId: string,
  runId: string,
  kind: string,
  activity: string,
): Promise<void> {
  try {
    const at = new Date().toISOString();
    const { results } = await env.DB.prepare(
      "SELECT trigger_kind, detail, stage, to_model, at FROM escalations WHERE ticket_id = ? AND run_id = ? ORDER BY at",
    )
      .bind(ticketId, runId)
      .all<{ trigger_kind: string; detail: string; stage: string | null; to_model: string | null; at: string }>();
    const escalations = (results ?? []).map((r) => ({
      trigger: r.trigger_kind,
      detail: r.detail,
      stage: r.stage ?? undefined,
      toModel: r.to_model ?? undefined,
      at: r.at,
    }));
    // Trace BODY is an immutable R2 blob (no KV size ceiling); the
    // queryable INDEX is D1.
    await env.BLOBS.put(
      `trace/${ticketId}/${runId}.json`,
      JSON.stringify({
        ticketId,
        runId,
        kind,
        archivedAt: at,
        ...(escalations.length ? { escalations } : {}),
        activity: JSON.parse(activity),
      }),
    );
    await insertTraceIndex(env, { ticketId, runId, kind, archivedAt: at });
    // Lifecycle hook: plugins react to archived traces (e.g. knowledge
    // distills + indexes the run for fleet search). Best-effort by contract.
    await fireHook(env, env.SELF_URL ?? "", "onTraceArchived", {
      ticketId,
      runId,
      kind,
      activityJson: activity,
      escalations: escalations.length ? escalations : undefined,
    });
  } catch (err) {
    console.warn(`trace archive failed for ${ticketId}:${runId}:`, err);
  }
}

/**
 * Durable ticket lifecycle mirroring original Workhorse statuses:
 *   planning → implementing → in-review → done
 * "done" is ONLY reachable via an external signal (PR merged/closed) —
 * the agent cannot mark its own work done. While in-review the instance
 * parks on waitForEvent; webhook events (PR reviews, comments, CI failures)
 * wake it into a revision run that sees all accumulated feedback.
 */
export class TicketWorkflow extends WorkflowEntrypoint<Env, TicketParams> {
  async run(event: WorkflowEvent<TicketParams>, step: WorkflowStep) {
    try {
      await this.runLifecycle(event, step);
    } catch (err) {
      // A crashed workflow must never leave the ticket looking alive:
      // reflect the failure in the registry, then rethrow so the
      // instance itself reads Errored too.
      await updateTicket(this.env, event.payload.id, {
        status: "errored",
        error: String(err).slice(0, 500),
      }).catch(() => {});
      throw err;
    }
  }

  /**
   * Prepare a sandbox for a run: auth, workspace clone, agent blocks, memory,
   * browser config, ticket context, dep cache. Shared by the engine path's
   * "prepare" step and the def path's initial + post-throttle re-prepare
   * (a durable step.sleep past sleepAfter wipes the container disk).
   */
  private async prepareRun(step: WorkflowStep, t: TicketParams, sandboxId: string, stepName: string) {
    await step.do(
      stepName,
      { retries: { limit: 6, delay: "20 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "planning" });
        await injectAuth(this.env, sandboxId, await freshToken(this.env, t.accessToken));
        await prepareWorkspace(this.env, sandboxId, t.repo, t.model, t.workflow);
        const { installAgentBlocks } = await import("./agents");
        await installAgentBlocks(this.env, sandboxId);
        await restoreMemory(this.env, sandboxId, t.repo);
        await injectBrowserConfig(this.env, sandboxId);
        await injectTicketContext(this.env, sandboxId, t.id, t.repo);
        const dep = await restoreDepCache(this.env, sandboxId, t.repo);
        if (dep !== "skip") console.log(`depcache restore ${t.id}: ${dep}`);
      },
    );
  }

  /**
   * Flue-first run: drive a hard-coded WorkflowDef to a terminal outcome,
   * then deliver via the shared PR/report/artifact paths. run(ctx) executes
   * in-process inside a step; a capacity ThrottledPark returns {throttled}
   * and the spine sleeps durably (step.sleep) then re-prepares + re-invokes
   * (whole-pipeline granularity; completed stages replay from disk when the
   * sandbox survived, else re-run in the fresh clone). Steering + awaiting-
   * input parks are engine-path features not yet ported (tracked).
   */
  /**
   * Drive one WorkflowDef run to a terminal outcome, handling the capacity
   * throttle-park loop (durable step.sleep + re-prepare + re-invoke). Shared
   * by the initial run and both revision loops. `branch` (revisions) checks
   * out the existing ticket branch after prepare so the agent refines prior
   * work. Returns the delivered {outcome, result}; throws on hard failure or
   * throttle-budget exhaustion.
   */
  private async driveDefRun(
    step: WorkflowStep,
    t: TicketParams,
    sandboxId: string,
    opts: { runId: string; label: string; prompt: string; branch?: string },
  ): Promise<{ outcome: "pr" | "report" | "artifact"; result: string }> {
    const { runId, label } = opts;
    const MAX_THROTTLE_PARKS = 12;
    let parks = 0;

    for (let attempt = 1; ; attempt++) {
      await this.prepareRun(step, t, sandboxId, `${label}-prepare-${attempt}`);
      if (opts.branch) {
        await step.do(`${label}-checkout-${attempt}`, async () => {
          await checkoutTicketBranch(this.env, sandboxId, t.repo, opts.branch!, this.env.GITHUB_TOKEN);
        });
      }
      await step.do(`${label}-mark-${attempt}`, async () => {
        await updateTicket(this.env, t.id, { status: "implementing", runId });
      });

      const drive = (await step.do(
        `${label}-run-${attempt}`,
        { retries: { limit: 1, delay: "10 seconds" }, timeout: "30 minutes" },
        async () => {
          const r = await runWorkflowDef({
            env: this.env,
            sandboxId,
            selfOrigin: this.env.SELF_URL ?? "",
            ticketId: t.id,
            repo: t.repo,
            def: workflowDef(t.workflow)!,
            runId,
            task: opts.prompt,
            inputs: t.inputs,
            model: t.model,
            onStage: async (s) => {
              const phase = /^(verify|fix)/.test(s.id) ? "ready-for-review" : "implementing";
              if (s.status === "running") await updateTicket(this.env, t.id, { status: phase });
              await setLive(this.env, t.id, { phase: s.id, runId, note: `${s.id}: ${s.status}` });
            },
          });
          return JSON.stringify(r);
        },
      ).then((s) => JSON.parse(s as string))) as DefRunResult;

      await step.do(`${label}-trace-${attempt}`, async () => {
        await this.env.TICKETS.put(`activity:${t.id}`, JSON.stringify(drive.activity));
        await archiveTrace(this.env, t.id, runId, attempt === 1 ? label : `${label}-attempt-${attempt}`, JSON.stringify(drive.activity));
      }).catch(() => {});

      if (drive.status === "throttled") {
        if (++parks > MAX_THROTTLE_PARKS) {
          await updateTicket(this.env, t.id, { status: "errored", error: `model capacity throttled past ${MAX_THROTTLE_PARKS} waits` });
          throw new Error("throttle park budget exhausted");
        }
        const sleepMs = Math.min(Math.max(drive.retryAfterMs, 30_000), 60 * 60_000);
        await step.do(`${label}-throttle-${attempt}`, async () => {
          await recordEscalation(this.env, t.id, runId, {
            trigger: "fallback",
            detail: `capacity throttle (${drive.providers.join(",")}); waiting ${Math.round(sleepMs / 1000)}s`,
            stage: drive.stageId,
          });
          await setLive(this.env, t.id, { phase: "waiting-for-capacity", runId, note: `all providers throttled; retry in ${Math.round(sleepMs / 1000)}s` });
        });
        await step.sleep(`${label}-capacity-sleep-${attempt}`, sleepMs);
        continue; // re-prepare (fresh disk after a long sleep) + re-run
      }

      await step.do(`${label}-collect-${attempt}`, async () => {
        await persistMemory(this.env, sandboxId, t.repo);
        await saveDepCache(this.env, sandboxId, t.repo);
      }).catch(() => {});
      return { outcome: drive.outcome, result: drive.result };
    }
  }

  private async runViaDef(step: WorkflowStep, t: TicketParams, sandboxId: string, branch: string) {
    const runId = `def-${t.id}`;
    const { outcome, result } = await this.driveDefRun(step, t, sandboxId, { runId, label: "def", prompt: t.prompt });

    // --- deliver by outcome kind (shared with the engine path) ---
    if (outcome === "report") {
      await step.do("def-deliver-report", async () => {
        await updateTicket(this.env, t.id, { status: "awaiting-acceptance", result });
        await setLive(this.env, t.id, { phase: "awaiting-acceptance", note: "report offered for acceptance" });
      });
      await this.acceptanceLoop(step, t, sandboxId, runId);
      return;
    }

    const prUrl = await step.do(
      "def-deliver",
      { retries: { limit: 2, delay: "15 seconds" }, timeout: "10 minutes" },
      async () => {
        const { diff, pushed } = await deliverBranch(this.env, sandboxId, t.id, t.repo, t.title);
        await this.env.TICKETS.put(`diff:${t.id}`, diff);
        if (!pushed) {
          await updateTicket(this.env, t.id, { status: "errored", result, branch, error: "push failed" });
          throw new Error("push failed");
        }
        if (outcome === "artifact") {
          await updateTicket(this.env, t.id, { status: "awaiting-acceptance", result, branch });
          return null;
        }
        const m = t.repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/)!;
        const resp = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/pulls`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
            accept: "application/vnd.github+json",
            "user-agent": "workhorse",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: t.title,
            head: branch,
            base: "main",
            body: `## Workhorse ticket ${t.id}\n\n**Task:** ${t.prompt}\n\n${result.slice(0, 3000)}\n\n---\n*Workhorse run \`${runId}\`. Reviews/comments on this PR wake the agent for revisions; merging completes the ticket.*`,
          }),
        });
        const pr = (await resp.json()) as { html_url?: string; number?: number; message?: string };
        if (!pr.html_url || !pr.number) throw new Error(`PR creation failed: ${pr.message ?? resp.status}`);
        await this.env.TICKETS.put(`pr:${m[1]}/${m[2]}#${pr.number}`, t.id);
        await updateTicket(this.env, t.id, { status: "in-review", result, branch, prUrl: pr.html_url });
        return pr.html_url;
      },
    );

    if (!prUrl) {
      await this.acceptanceLoop(step, t, sandboxId, runId);
      return;
    }
    await this.reviewLoop(step, t, sandboxId, branch, prUrl);
  }

  private async runLifecycle(event: WorkflowEvent<TicketParams>, step: WorkflowStep) {
    const t = event.payload;
    const sandboxId = `ticket-${t.id}`;
    const branch = `workhorse/${t.id}`;

    // --- healing resume: skip completed phases recorded on the ticket ---
    if (t.resume) {
      const rec = await step.do("read-resume-state", async () => getTicket(this.env, t.id));
      if (rec?.prUrl) {
        // Work was already delivered — jump straight back to the
        // park ↔ revise loop; pending events (if any) wake immediately.
        await updateTicket(this.env, t.id, { status: "in-review", error: undefined });
        await this.reviewLoop(step, t, sandboxId, branch, rec.prUrl);
        return;
      }
      // No PR yet: nothing durable was delivered; fall through to a full
      // re-run (idempotent — fresh sandbox, branch is force-pushed later).
    }

    // Every workflow is a hard-coded WorkflowDef, run in-process via the
    // spine (no engine interpreter, no registry). An unknown workflow name
    // has no def and cannot run.
    if (!workflowDef(t.workflow)) {
      await updateTicket(this.env, t.id, { status: "errored", error: `unknown workflow "${t.workflow}" (no hard-coded def)` });
      throw new Error(`unknown workflow "${t.workflow}"`);
    }
    await this.runViaDef(step, t, sandboxId, branch);
  }

  /**
   * Acceptance park for report/artifact outcomes: done comes ONLY from an
   * operator action (accept) — the agent never self-completes. "Request
   * changes" feedback re-runs the workflow with the operator's comments,
   * mirroring the PR revision loop.
   */
  private async acceptanceLoop(
    step: WorkflowStep,
    t: TicketParams,
    sandboxId: string,
    runId: string,
  ) {
    for (let round = 1; round <= MAX_REVISIONS; round++) {
      let events = (await step.do(`acc-check-${round}`, async () =>
        unconsumedEvents(this.env, t.id),
      )) as ExternalEvent[];
      if (events.length === 0) {
        await setLive(this.env, t.id, { phase: "awaiting-acceptance", note: "waiting for operator" });
        try {
          await step.waitForEvent(`acc-park-${round}`, { type: "external-event", timeout: "90 days" });
        } catch {
          await updateTicket(this.env, t.id, { status: "terminated", error: "acceptance window expired (90 days)" });
          return;
        }
        events = (await step.do(`acc-read-${round}`, async () =>
          unconsumedEvents(this.env, t.id),
        )) as ExternalEvent[];
      }

      const accepted = events.find((e) => e.kind === "accepted" || e.kind === "jira-done");
      if (accepted) {
        await step.do(`acc-finish-${round}`, async () => {
          await consumeEvents(this.env, t.id);
          await updateTicket(this.env, t.id, { status: "done" });
        });
        return;
      }

      const feedback = events.filter((e) => e.kind === "changes-requested" || e.kind === "jira-comment");
      if (feedback.length === 0) {
        await step.do(`acc-consume-${round}`, async () => consumeEvents(this.env, t.id));
        continue;
      }

      // Revision: re-run the def with the operator's feedback folded in.
      const fb = feedback.map((e) => `- ${e.summary}`).join("\n");
      await step.do(`acc-consume-fb-${round}`, async () => consumeEvents(this.env, t.id));
      const { result } = await this.driveDefRun(step, t, sandboxId, {
        runId: `def-${t.id}-accrev${round}`,
        label: `acc-rev${round}`,
        prompt: `${t.prompt}\n\nYour previous result was reviewed by the operator, who requested changes:\n${fb}\n\nRevise your work to address ALL the feedback.`,
      });
      await step.do(`acc-redeliver-${round}`, async () => {
        await updateTicket(this.env, t.id, { status: "awaiting-acceptance", result });
      });
    }
    await updateTicket(this.env, t.id, { status: "terminated", error: "max acceptance revisions reached" });
  }

  /**
   * The in-review park ↔ revise loop. Extracted so healing re-dispatches
   * can re-enter it directly when a PR already exists.
   */
  private async reviewLoop(
    step: WorkflowStep,
    t: TicketParams,
    sandboxId: string,
    branch: string,
    prUrl: string,
  ) {
    for (let round = 1; round <= MAX_REVISIONS; round++) {
      // Anything queued while we were busy? Consume before parking.
      let events = (await step.do(`check-events-${round}`, async () =>
        unconsumedEvents(this.env, t.id),
      )) as ExternalEvent[];

      if (events.length === 0) {
        await setLive(this.env, t.id, { phase: "parked", note: "in-review; waiting for PR feedback" });
        try {
          await step.waitForEvent(`park-${round}`, { type: "external-event", timeout: "90 days" });
        } catch {
          await updateTicket(this.env, t.id, { status: "terminated", error: "review window expired (90 days)" });
          return;
        }
        events = (await step.do(`read-events-${round}`, async () =>
          unconsumedEvents(this.env, t.id),
        )) as ExternalEvent[];
      }

      // Completion signals are pluggable: PR merge (github), Jira Done,
      // operator Accept — any plugin can emit one via Core.signalTransition.
      const terminal = events.find((e) =>
        ["pr-merged", "pr-closed", "jira-done", "accepted"].includes(e.kind),
      );
      if (terminal) {
        await step.do(`finish-${round}`, async () => {
          await consumeEvents(this.env, t.id);
          await updateTicket(this.env, t.id, {
            status: terminal.kind === "pr-closed" ? "terminated" : "done",
            error: terminal.kind === "pr-closed" ? "PR closed without merge" : undefined,
          });
        });
        await setLive(this.env, t.id, { phase: "finished", outcome: terminal.kind });
        return;
      }

      if (events.length === 0) continue; // spurious wake

      // --- revision run: fresh staged workflow with the feedback in hand ---
      // Feedback = wake events + everything queued on the notification bus
      // since the last read point (acknowledge-collate semantics).
      const feedback = await step.do(`revise-feedback-${round}`, async () => {
        const { unreadNotifications, markNotificationsRead } = await import("./notifications");
        const queued = await unreadNotifications(this.env, t.id);
        if (queued.length) await markNotificationsRead(this.env, t.id, queued[queued.length - 1].seq);
        return [
          ...events.map((e) => `- [${e.kind}] ${e.summary}`),
          ...queued.map((n) => `- [${n.source}${n.author ? ` · ${n.author}` : ""}] ${n.body.slice(0, 1500)}`),
        ].join("\n");
      });

      // Revise on the existing branch (driveDefRun checks it out post-prepare).
      const { result } = await this.driveDefRun(step, t, sandboxId, {
        runId: `def-${t.id}-rev${round}`,
        label: `rev${round}`,
        branch,
        prompt: `${t.prompt}\n\nYour earlier implementation is on the current branch and has an open PR (${prUrl}). New external feedback arrived that you must address now:\n${feedback}\n\nAddress ALL feedback with further code changes on this branch. Do not start over.`,
      });

      await step.do(`redeliver-${round}`, { timeout: "10 minutes" }, async () => {
        const { diff, pushed } = await deliverBranch(this.env, sandboxId, t.id, t.repo, `${t.title} (revision ${round})`);
        if (pushed) await this.env.TICKETS.put(`diff:${t.id}`, diff);
        await consumeEvents(this.env, t.id);
        await updateTicket(this.env, t.id, { status: "in-review", result });
        // Close the conversational loop: reply on the PR with what was done.
        const prNum = prUrl?.match(/\/pull\/(\d+)/)?.[1];
        const m = t.repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (prNum && m) {
          const changed = pushed && diff.trim().length > 0;
          const body = `**Workhorse revision ${round}** ${changed ? "— changes pushed to this branch" : "— no code changes needed"}\n\n${result.slice(0, 2500)}\n\n---\n*Replying to:*\n${events.map((e) => `> ${e.summary}`).join("\n")}`;
          await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/issues/${prNum}/comments`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
              accept: "application/vnd.github+json",
              "user-agent": "workhorse",
              "content-type": "application/json",
            },
            body: JSON.stringify({ body }),
          }).catch(() => {}); // reply is best-effort, never fails the step
        }
      });
    }

    await updateTicket(this.env, t.id, { status: "terminated", error: `revision limit (${MAX_REVISIONS}) reached` });
  }
}
