import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import {
  injectAuth,
  prepareWorkspace,
  startWorkflow,
  superviseWorkflow,
  collectResult,
  collectActivity,
  deliverBranch,
} from "./agent-run";
import type { Env, TicketParams, TicketRecord } from "./types";

async function updateTicket(env: Env, id: string, patch: Partial<TicketRecord>) {
  const raw = await env.TICKETS.get(id);
  if (!raw) return;
  const rec = { ...(JSON.parse(raw) as TicketRecord), ...patch, updatedAt: new Date().toISOString() };
  await env.TICKETS.put(id, JSON.stringify(rec));
}

/**
 * Durable ticket lifecycle (coarse). The rich staged execution — per-stage
 * tool gating, artifacts, budgets — happens INSIDE the sandbox, run by
 * @agwab/pi-workflow from the baked `coding` spec (plan → implement).
 */
export class TicketWorkflow extends WorkflowEntrypoint<Env, TicketParams> {
  async run(event: WorkflowEvent<TicketParams>, step: WorkflowStep) {
    const t = event.payload;
    const sandboxId = `ticket-${t.id}`;

    // Step 1: prepare — auth + repo + workflow bundle in the sandbox.
    await step.do(
      "prepare",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "planning" });
        await injectAuth(this.env, sandboxId, t.accessToken);
        await prepareWorkspace(this.env, sandboxId, t.repo);
      },
    );

    // Step 2: start the pi-workflow run (returns its run id).
    const runId = await step.do(
      "start-workflow",
      { retries: { limit: 1, delay: "10 seconds" }, timeout: "10 minutes" },
      async () => {
        const id = await startWorkflow(this.env, sandboxId, t.prompt);
        await updateTicket(this.env, t.id, { runId: id });
        return id;
      },
    );

    // Step 3: supervise the staged graph to completion (plan → implement).
    const wf = await step.do(
      "supervise",
      { retries: { limit: 2, delay: "30 seconds" }, timeout: "40 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "implementing" });
        // Token may have aged if retries delayed us; re-inject before driving.
        await injectAuth(this.env, sandboxId, t.accessToken);
        const res = await superviseWorkflow(this.env, sandboxId, runId);
        if (res.status !== "completed") {
          throw new Error(`pi-workflow run ${runId} ended ${res.status}`);
        }
        return res;
      },
    );

    // Step 4: collect artifacts (implement analysis + diff stat + activity trail).
    const result = await step.do("collect", { timeout: "5 minutes" }, async () => {
      const { analysis, diffStat } = await collectResult(this.env, sandboxId, runId);
      const activity = await collectActivity(this.env, sandboxId, runId);
      await this.env.TICKETS.put(`activity:${t.id}`, activity);
      return `${diffStat}\n\n${analysis}`.trim();
    });

    // Step 5: deliver — branch, push, persist diff, open PR.
    const delivery = await step.do(
      "deliver",
      { retries: { limit: 2, delay: "15 seconds" }, timeout: "10 minutes" },
      async () => {
        const { branch, diff, pushed } = await deliverBranch(
          this.env,
          sandboxId,
          t.id,
          t.repo,
          t.title,
        );
        // Persist the full diff durably (survives sandbox death).
        await this.env.TICKETS.put(`diff:${t.id}`, diff);
        if (!pushed) {
          await updateTicket(this.env, t.id, { status: "done", result, branch });
          return { branch, prUrl: null, note: "push failed (no write access?) — diff persisted" };
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
            body: `## Workhorse ticket ${t.id}\n\n**Task:** ${t.prompt}\n\n${result.slice(0, 3000)}\n\n---\n*Filed via Workhorse; staged run \`${runId}\` (plan \u2192 implement, per-stage tool gating).*`,
          }),
        });
        const pr = (await resp.json()) as { html_url?: string; message?: string };
        const prUrl = pr.html_url ?? null;
        await updateTicket(this.env, t.id, {
          status: "done",
          result,
          branch,
          prUrl: prUrl ?? undefined,
          error: prUrl ? undefined : `PR creation: ${pr.message ?? resp.status}`,
        });
        return { branch, prUrl };
      },
    );

    return { outcome: "done", runId, tasks: wf.tasks, result, ...delivery };
  }
}
