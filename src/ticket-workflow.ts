import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { injectAuth, cloneRepo, runAgent } from "./agent-run";
import type { Env, TicketParams, TicketRecord } from "./types";

async function updateTicket(env: Env, id: string, patch: Partial<TicketRecord>) {
  const raw = await env.TICKETS.get(id);
  if (!raw) return;
  const rec = { ...(JSON.parse(raw) as TicketRecord), ...patch, updatedAt: new Date().toISOString() };
  await env.TICKETS.put(id, JSON.stringify(rec));
}

export class TicketWorkflow extends WorkflowEntrypoint<Env, TicketParams> {
  async run(event: WorkflowEvent<TicketParams>, step: WorkflowStep) {
    const t = event.payload;
    const sandboxId = `ticket-${t.id}`;

    // Stage 1: PLAN (read-only)
    const plan = await step.do(
      "plan",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "15 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "planning" });
        await injectAuth(this.env, sandboxId, t.accessToken);
        await cloneRepo(this.env, sandboxId, t.repo);
        const plan = await runAgent(
          this.env,
          sandboxId,
          `Task: ${t.prompt}\n\nStudy this repository and produce a concise implementation plan: which files you will change and how, risks, and how you will verify. End with the exact list of files to be modified.`,
          { readOnly: true },
        );
        await updateTicket(this.env, t.id, { plan });
        return plan;
      },
    );

    // Stage 2: IMPLEMENT (write allowed) — autonomous, no approval gate.
    // (Human-in-the-loop placement is a later design decision; the spike
    // proved step.waitForEvent works when we want it.)
    const result = await step.do(
      "implement",
      { retries: { limit: 1, delay: "10 seconds" }, timeout: "30 minutes" },
      async () => {
        await updateTicket(this.env, t.id, { status: "implementing" });
        // Re-inject: the sandbox may have slept; token may have been rotated by dispatcher.
        await injectAuth(this.env, sandboxId, t.accessToken);
        await cloneRepo(this.env, sandboxId, t.repo);
        const out = await runAgent(
          this.env,
          sandboxId,
          `Task: ${t.prompt}\n\nA plan already exists:\n${plan}\n\nImplement it now. Make the code changes. When done, run: git add -A && git diff --cached --stat  — and end your reply with that diff stat.`,
        );
        await updateTicket(this.env, t.id, { status: "done", result: out });
        return out;
      },
    );

    return { outcome: "done", plan, result };
  }
}
