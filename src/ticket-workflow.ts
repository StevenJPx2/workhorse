import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import {
  injectAuth,
  injectApiKeyAuth,
  injectBrowserConfig,
  prepareWorkspace,
  startWorkflow,
  driveWorkflow,
  escalateWorkflow,
  collectResult,
  collectActivity,
  deliverBranch,
  checkoutTicketBranch,
  restoreMemory,
  persistMemory,
} from "./agent-run";
import { FALLBACK_LEGS, PROMOTION_CHAIN, MAX_PROMOTIONS, nextModelUp } from "./model-chains";
import { unconsumedEvents, consumeEvents } from "./events";
import type { ExternalEvent } from "./plugins/types";
import type { Env, TicketParams, TicketRecord } from "./types";

async function updateTicket(env: Env, id: string, patch: Partial<TicketRecord>) {
  const raw = await env.TICKETS.get(id);
  if (!raw) return;
  const rec = { ...(JSON.parse(raw) as TicketRecord), ...patch, updatedAt: new Date().toISOString() };
  await env.TICKETS.put(id, JSON.stringify(rec));
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
  trigger: "fallback" | "promotion";
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
  const key = `esc:${ticketId}:${runId}`;
  const raw = await env.TICKETS.get(key);
  const events = raw ? (JSON.parse(raw) as EscalationEvent[]) : [];
  events.push({ at: new Date().toISOString(), ...event });
  await env.TICKETS.put(key, JSON.stringify(events));
}

/**
 * Durable trace archive for optimization mining + evals: one immutable
 * record per pi-workflow run (activity:<id> is a "latest" pointer that gets
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
    const escRaw = await env.TICKETS.get(`esc:${ticketId}:${runId}`);
    const escalations = escRaw ? (JSON.parse(escRaw) as EscalationEvent[]) : undefined;
    await env.TICKETS.put(
      `trace:${ticketId}:${runId}`,
      JSON.stringify({
        ticketId,
        runId,
        kind,
        archivedAt: at,
        ...(escalations?.length ? { escalations } : {}),
        activity: JSON.parse(activity),
      }),
    );
    const idxRaw = await env.TICKETS.get(`traces:${ticketId}`);
    const idx = idxRaw ? (JSON.parse(idxRaw) as Array<Record<string, string>>) : [];
    if (!idx.some((e) => e.runId === runId)) {
      idx.push({ runId, kind, archivedAt: at });
      await env.TICKETS.put(`traces:${ticketId}`, JSON.stringify(idx));
    }
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
  /**
   * Drive a pi-workflow graph to completion in short supervisor bursts.
   * Long-lived execs through the sandbox DO die silently (observed: the
   * detached supervisor exits with its parent and a 25-min exec never
   * returns), so we loop ~50s bursts — each burst also publishes a live
   * observability snapshot for the UI.
   */
  private async driveToCompletion(
    step: WorkflowStep,
    sandboxId: string,
    runId: string,
    ticketId: string,
    label: string,
  ): Promise<void> {
    // Escalation bookkeeping (one mechanism, two triggers): which
    // availability-fallback legs were burned, which stages already
    // promoted, how many promotions consumed.
    let fallbackLeg = 0;
    const promotedStages = new Set<string>();
    let promotions = 0;

    for (let burst = 1; burst <= 60; burst++) {
      const res = await step.do(
        `${label}-drive-${burst}`,
        { retries: { limit: 2, delay: "10 seconds" }, timeout: "4 minutes" },
        async () => {
          const r = await driveWorkflow(this.env, sandboxId, runId);
          await setLive(this.env, ticketId, { phase: label, runId, ...r });
          // Mirror the running pipeline stage onto the ticket status:
          // verify/fix stages = the adversarial "ready-for-review" pass.
          const active = r.tasks.find((t) => t.status === "running")?.id ?? "";
          if (/^(verify|fix)\./.test(active)) {
            await updateTicket(this.env, ticketId, { status: "ready-for-review" });
          }
          return r;
        },
      );

      // --- capability-driven promotion: a stage signalled "not equipped" ---
      // Intercept as soon as the delegate flag shows up on a completed
      // stage, before (or even after) downstream stages consume its output:
      // the stage is re-run one model up, dependents re-run via the spec's
      // invalidateOnDependencyResume.
      const del = res.delegating;
      if (del && !promotedStages.has(del.taskId) && promotions < MAX_PROMOTIONS) {
        const toModel = nextModelUp(PROMOTION_CHAIN, del.model);
        promotedStages.add(del.taskId); // even if unpromotable: signal is consumed
        if (toModel) {
          promotions++;
          await step.do(
            `${label}-promote-${del.taskId}-${promotions}`,
            { retries: { limit: 1, delay: "15 seconds" }, timeout: "5 minutes" },
            async () => {
              await escalateWorkflow(this.env, sandboxId, runId, {
                failSpecId: del.taskId,
                model: toModel,
              });
              await recordEscalation(this.env, ticketId, runId, {
                trigger: "promotion",
                detail: del.reason ?? "stage delegated",
                stage: del.taskId,
                fromModel: del.model,
                toModel,
              });
              await setLive(this.env, ticketId, {
                phase: label,
                runId,
                note: `promoting ${del.taskId} to ${toModel}`,
              });
            },
          );
          continue; // resume driving with the promoted stage pending
        }
        // Already at the top of the chain: ignore the signal, keep going.
      }

      if (res.status === "completed") return;
      if (res.status === "failed" || res.status === "interrupted") {
        // --- availability-driven fallback: the MODEL plane died (429 /
        // credit exhaustion / expired token). Walk the credential legs:
        // fresh custodian OAuth token first, then a metered API key.
        if (res.modelFailure) {
          // Skip legs that need an unconfigured credential.
          let leg;
          while (fallbackLeg < FALLBACK_LEGS.length) {
            const candidate = FALLBACK_LEGS[fallbackLeg++];
            if (candidate.auth === "api-key" && !this.env.ANTHROPIC_API_KEY) continue;
            leg = candidate;
            break;
          }
          if (leg) {
            await step.do(
              `${label}-fallback-${fallbackLeg}`,
              { retries: { limit: 1, delay: "15 seconds" }, timeout: "5 minutes" },
              async () => {
                if (leg.auth === "api-key") {
                  await injectApiKeyAuth(this.env, sandboxId, this.env.ANTHROPIC_API_KEY!);
                } else {
                  const stored = await this.env.TICKETS.get("auth:access");
                  const parsed = stored
                    ? (JSON.parse(stored) as { access: string; expires: number })
                    : null;
                  if (!parsed || parsed.expires - Date.now() < 5 * 60 * 1000) {
                    throw new Error("no fresh custodian token for oauth fallback leg");
                  }
                  await injectAuth(this.env, sandboxId, parsed.access);
                }
                await escalateWorkflow(this.env, sandboxId, runId, leg.model ? { model: leg.model } : {});
                await recordEscalation(this.env, ticketId, runId, {
                  trigger: "fallback",
                  detail: `model-plane failure; retrying on ${leg.auth}${leg.model ? ` (${leg.model})` : ""}`,
                });
                await setLive(this.env, ticketId, {
                  phase: label,
                  runId,
                  note: `model fallback: retrying on ${leg.auth}`,
                });
              },
            ).catch(() => {}); // a failed leg is not terminal — next burst re-reads status
            continue;
          }
        }
        // Capture the post-mortem NOW — the sandbox disk vanishes minutes
        // after failure (sleepAfter), taking task errors/output with it.
        await step.do(`${label}-capture-failure`, { timeout: "3 minutes" }, async () => {
          const activity = await collectActivity(this.env, sandboxId, runId);
          await this.env.TICKETS.put(`activity:${ticketId}`, activity);
          await archiveTrace(this.env, ticketId, runId, `${label}-failed`, activity);
        }).catch(() => {});
        throw new Error(`pi-workflow run ${runId} ended ${res.status}`);
      }
    }
    throw new Error(`pi-workflow run ${runId} did not finish within drive budget`);
  }

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

  private async runLifecycle(event: WorkflowEvent<TicketParams>, step: WorkflowStep) {
    const t = event.payload;
    const sandboxId = `ticket-${t.id}`;
    const branch = `workhorse/${t.id}`;

    // --- healing resume: skip completed phases recorded on the ticket ---
    if (t.resume) {
      const rec = await step.do("read-resume-state", async () => {
        const raw = await this.env.TICKETS.get(t.id);
        return raw ? (JSON.parse(raw) as TicketRecord) : null;
      });
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

    // --- planning + implementing (the staged pi-workflow run) ---
    await step.do(
      "prepare",
      // Generous retries: parallel fleet dispatch means fresh containers can
      // stay in "Container is starting" for minutes under provisioning load.
      { retries: { limit: 6, delay: "20 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "planning" });
        await injectAuth(this.env, sandboxId, await freshToken(this.env, t.accessToken));
        await prepareWorkspace(this.env, sandboxId, t.repo, t.model, t.workflow);
        // Fleet memory: seed the sandbox with this repo's accumulated memories.
        await restoreMemory(this.env, sandboxId, t.repo);
        // Browser plane: let gated stages fetch live web pages via the Worker.
        await injectBrowserConfig(this.env, sandboxId);
      },
    );

    const runId = await step.do(
      "start-workflow",
      { retries: { limit: 1, delay: "10 seconds" }, timeout: "10 minutes" },
      async () => {
        const id = await startWorkflow(this.env, sandboxId, t.prompt, t.workflow);
        await updateTicket(this.env, t.id, { runId: id });
        return id;
      },
    );

    await step.do("mark-implementing", async () => {
      await updateTicket(this.env, t.id, { status: "implementing" });
      await injectAuth(this.env, sandboxId, await freshToken(this.env, t.accessToken));
    });
    await this.driveToCompletion(step, sandboxId, runId, t.id, "run");

    const result = await step.do("collect", { timeout: "5 minutes" }, async () => {
      const { analysis, diffStat } = await collectResult(this.env, sandboxId, runId);
      const activity = await collectActivity(this.env, sandboxId, runId);
      await this.env.TICKETS.put(`activity:${t.id}`, activity);
      // Durable trace archive: one immutable record per run, never overwritten.
      await archiveTrace(this.env, t.id, runId, "initial", activity);
      // Fleet memory: persist what the agent learned about this repo.
      await persistMemory(this.env, sandboxId, t.repo);
      return `${diffStat}\n\n${analysis}`.trim();
    });

    // --- deliver: branch + PR, then hand off to external review ---
    const prUrl = await step.do(
      "deliver",
      { retries: { limit: 2, delay: "15 seconds" }, timeout: "10 minutes" },
      async () => {
        const { diff, pushed } = await deliverBranch(this.env, sandboxId, t.id, t.repo, t.title);
        await this.env.TICKETS.put(`diff:${t.id}`, diff);
        if (!pushed) {
          await updateTicket(this.env, t.id, { status: "errored", result, branch, error: "push failed" });
          throw new Error("push failed");
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
        if (!pr.html_url || !pr.number) {
          throw new Error(`PR creation failed: ${pr.message ?? resp.status}`);
        }
        // PR → ticket mapping for the webhook plugin.
        await this.env.TICKETS.put(`pr:${m[1]}/${m[2]}#${pr.number}`, t.id);
        await updateTicket(this.env, t.id, { status: "in-review", result, branch, prUrl: pr.html_url });
        return pr.html_url;
      },
    );

    // --- in-review: park ↔ revise loop; done only via external signal ---
    await this.reviewLoop(step, t, sandboxId, branch, prUrl);
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

      const terminal = events.find((e) => e.kind === "pr-merged" || e.kind === "pr-closed");
      if (terminal) {
        await step.do(`finish-${round}`, async () => {
          await consumeEvents(this.env, t.id);
          await updateTicket(this.env, t.id, {
            status: terminal.kind === "pr-merged" ? "done" : "terminated",
            error: terminal.kind === "pr-closed" ? "PR closed without merge" : undefined,
          });
        });
        await setLive(this.env, t.id, { phase: "finished", outcome: terminal.kind });
        return;
      }

      if (events.length === 0) continue; // spurious wake

      // --- revision run: fresh staged workflow with the feedback in hand ---
      const revisionRunId = await step.do(
        `revise-${round}`,
        { retries: { limit: 1, delay: "30 seconds" }, timeout: "40 minutes" },
        async () => {
          await updateTicket(this.env, t.id, { status: "implementing" });
          await injectAuth(this.env, sandboxId, await freshToken(this.env, t.accessToken));
          await prepareWorkspace(this.env, sandboxId, t.repo, t.model, t.workflow);
          await restoreMemory(this.env, sandboxId, t.repo);
          await injectBrowserConfig(this.env, sandboxId);
          await checkoutTicketBranch(this.env, sandboxId, t.repo, branch, this.env.GITHUB_TOKEN);
          const feedback = events
            .map((e) => `- [${e.kind}] ${e.summary}`)
            .join("\n");
          const revId = await startWorkflow(
            this.env,
            sandboxId,
            `${t.prompt}\n\nYour earlier implementation is on the current branch and has an open PR (${prUrl}). New external feedback arrived that you must address now:\n${feedback}\n\nAddress ALL feedback with further code changes on this branch. Do not start over.`,
            t.workflow,
          );
          await updateTicket(this.env, t.id, { runId: revId });
          return revId;
        },
      );
      await this.driveToCompletion(step, sandboxId, revisionRunId, t.id, `rev${round}`);

      await step.do(`redeliver-${round}`, { timeout: "10 minutes" }, async () => {
        const { analysis, diffStat } = await collectResult(this.env, sandboxId, revisionRunId);
        const activity = await collectActivity(this.env, sandboxId, revisionRunId);
        await this.env.TICKETS.put(`activity:${t.id}`, activity);
        await archiveTrace(this.env, t.id, revisionRunId, `revision-${round}`, activity);
        const { diff, pushed } = await deliverBranch(this.env, sandboxId, t.id, t.repo, `${t.title} (revision ${round})`);
        if (pushed) await this.env.TICKETS.put(`diff:${t.id}`, diff);
        await persistMemory(this.env, sandboxId, t.repo);
        await consumeEvents(this.env, t.id);
        await updateTicket(this.env, t.id, {
          status: "in-review",
          result: `${diffStat}\n\n${analysis}`.trim(),
        });
        // Close the conversational loop: reply on the PR with what was done
        // (or why nothing was changed). Without this, word-only feedback
        // looks ignored even though the agent processed it.
        const prNum = prUrl?.match(/\/pull\/(\d+)/)?.[1];
        const m = t.repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (prNum && m) {
          const changed = pushed && diff.trim().length > 0;
          const body = `**Workhorse revision ${round}** ${changed ? "— changes pushed to this branch" : "— no code changes needed"}\n\n${analysis.slice(0, 2500)}\n\n---\n*Replying to:*\n${events.map((e) => `> ${e.summary}`).join("\n")}`;
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
