// Flue-backed StageRunner (the engine's FLUE_STAGES path) — now a THIN
// adapter over the shared flue stage-session core (flue-session.ts). Kept
// only while the interpreter engine path exists; the flue-first workflow
// context (workflow-run.ts) uses the same core directly. The engine path has
// no durable park, so a capacity `throttled` outcome maps to a model failure
// here (heals/retries cover it); the flue-first spine sleeps durably instead.

import type { StageRunInput, StageRunResult, StageRunner } from "@workhorse/workflow";
import type { Env } from "@workhorse/api";
import { coreFor } from "./plugins";
import { makeStageSession } from "./flue-session";

export function flueStageRunner(
  env: Env,
  sandboxId: string,
  selfOrigin: string,
  ticketId: string,
): StageRunner {
  const core = coreFor(env, selfOrigin);
  const runStageSession = makeStageSession(env, sandboxId, selfOrigin);
  let repo = "";

  return {
    async runStage(input: StageRunInput): Promise<StageRunResult> {
      if (!repo) repo = (await core.getTicket(ticketId))?.repo ?? "";
      const outcome = await runStageSession({
        dir: input.dir,
        cwd: input.cwd,
        prompt: input.prompt,
        persona: input.persona,
        tools: input.tools,
        writeAllow: input.writeAllow,
        model: input.model,
        ticketId,
        repo,
        stageId: input.stageId,
      });
      if (outcome.ok) return { stats: outcome.stats };
      if ("throttled" in outcome) {
        return { failure: { kind: "model", detail: `throttled: ${outcome.throttled.detail}` } };
      }
      return { failure: outcome.failure };
    },
  };
}
