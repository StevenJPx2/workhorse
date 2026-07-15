import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import {
  injectAuth,
  prepareWorkspace,
  startWorkflow,
  driveWorkflow,
  collectResult,
  collectActivity,
  deliverBranch,
  checkoutTicketBranch,
  restoreMemory,
  persistMemory,
} from "./agent-run";
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

/** Live observability snapshot pushed to KV after every phase/burst. */
async function setLive(env: Env, ticketId: string, live: Record<string, unknown>): Promise<void> {
  await env.TICKETS.put(`live:${ticketId}`, JSON.stringify({ ...live, at: new Date().toISOString() }));
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
    await env.TICKETS.put(
      `trace:${ticketId}:${runId}`,
      JSON.stringify({ ticketId, runId, kind, archivedAt: at, activity: JSON.parse(activity) }),
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
      if (res.status === "completed") return;
      if (res.status === "failed" || res.status === "interrupted") {
        throw new Error(`pi-workflow run ${runId} ended ${res.status}`);
      }
    }
    throw new Error(`pi-workflow run ${runId} did not finish within drive budget`);
  }

  async run(event: WorkflowEvent<TicketParams>, step: WorkflowStep) {
    const t = event.payload;
    const sandboxId = `ticket-${t.id}`;
    const branch = `workhorse/${t.id}`;

    // --- planning + implementing (the staged pi-workflow run) ---
    await step.do(
      "prepare",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "planning" });
        await injectAuth(this.env, sandboxId, t.accessToken);
        await prepareWorkspace(this.env, sandboxId, t.repo, t.model);
        // Fleet memory: seed the sandbox with this repo's accumulated memories.
        await restoreMemory(this.env, sandboxId, t.repo);
      },
    );

    const runId = await step.do(
      "start-workflow",
      { retries: { limit: 1, delay: "10 seconds" }, timeout: "10 minutes" },
      async () => {
        const id = await startWorkflow(this.env, sandboxId, t.prompt);
        await updateTicket(this.env, t.id, { runId: id });
        return id;
      },
    );

    await step.do("mark-implementing", async () => {
      await updateTicket(this.env, t.id, { status: "implementing" });
      await injectAuth(this.env, sandboxId, t.accessToken);
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
          return { outcome: "expired", prUrl };
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
        return { outcome: terminal.kind, prUrl, revisions: round - 1 };
      }

      if (events.length === 0) continue; // spurious wake

      // --- revision run: fresh staged workflow with the feedback in hand ---
      const revisionRunId = await step.do(
        `revise-${round}`,
        { retries: { limit: 1, delay: "30 seconds" }, timeout: "40 minutes" },
        async () => {
          await updateTicket(this.env, t.id, { status: "implementing" });
          await injectAuth(this.env, sandboxId, t.accessToken);
          await prepareWorkspace(this.env, sandboxId, t.repo, t.model);
          await restoreMemory(this.env, sandboxId, t.repo);
          await checkoutTicketBranch(this.env, sandboxId, t.repo, branch, this.env.GITHUB_TOKEN);
          const feedback = events
            .map((e) => `- [${e.kind}] ${e.summary}`)
            .join("\n");
          const revId = await startWorkflow(
            this.env,
            sandboxId,
            `${t.prompt}\n\nYour earlier implementation is on the current branch and has an open PR (${prUrl}). New external feedback arrived that you must address now:\n${feedback}\n\nAddress ALL feedback with further code changes on this branch. Do not start over.`,
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
      });
    }

    await updateTicket(this.env, t.id, { status: "terminated", error: `revision limit (${MAX_REVISIONS}) reached` });
    return { outcome: "revision-limit", prUrl };
  }
}
