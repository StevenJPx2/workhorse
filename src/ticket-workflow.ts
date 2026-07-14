import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import {
  injectAuth,
  prepareWorkspace,
  startWorkflow,
  superviseWorkflow,
  collectResult,
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
      async () => startWorkflow(this.env, sandboxId, t.prompt),
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

    // Step 4: collect artifacts (implement analysis + diff stat).
    const result = await step.do("collect", { timeout: "5 minutes" }, async () => {
      const { analysis, diffStat } = await collectResult(this.env, sandboxId, runId);
      const summary = `${diffStat}\n\n${analysis}`.trim();
      await updateTicket(this.env, t.id, { status: "done", result: summary });
      return summary;
    });

    return { outcome: "done", runId, tasks: wf.tasks, result };
  }
}
