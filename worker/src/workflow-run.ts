// Flue-first workflow context — the concrete WorkflowContext the spine passes
// to a WorkflowDef.run(). Each ctx.stage() reproduces the engine's per-stage
// assembly (persona from the agent block, tool ceiling, prompt with upstream
// digests) using the package's pure helpers, then runs the session via the
// shared flue stage-session core.
//
// Idempotent replay: a stage's artifacts are keyed by (stageId, round). If a
// round's control.json already exists, ctx.stage returns it WITHOUT re-running
// — so when a ThrottledPark unwinds run() and the spine re-invokes it after a
// durable sleep, completed stages replay from disk and the run resumes at the
// throttled stage. Same property covers step crash-retry.

import {
  assemblePrompt,
  stageDir,
  stageSession,
  upstreamDigest,
  validateAgainstSchema,
  StageFailure,
  ThrottledPark,
  type JsonSchema,
  type StageResult,
  type StageInvocation,
  type StageSpec,
  type WorkflowContext,
  type WorkflowDef,
} from "@workhorse/workflow";
import type { Env, SandboxHandle } from "@workhorse/api";
import { sandboxDriver } from "./agent-run";
import { makeStageSession } from "./flue-session";

export interface WorkflowRunDeps {
  env: Env;
  sandboxId: string;
  selfOrigin: string;
  ticketId: string;
  repo: string;
  def: WorkflowDef;
  runId: string;
  task: string;
  inputs?: Record<string, string | number | boolean>;
  /** Dispatch-time model override. */
  model?: string;
  /** Repo working dir in the container. */
  cwd?: string;
  /** Live-status hook: called on each stage transition (UI snapshot + trace). */
  onStage?: (s: {
    id: string;
    status: "running" | "completed";
    round: number;
    control?: Record<string, unknown>;
    analysis?: string;
    stats?: StageResult["stats"];
  }) => Promise<void>;
  /** Notification read point for stages that declare notifications: "read". */
  readNotifications?: (stageId: string) => Promise<string | null>;
}

async function readStageResult(
  sandbox: SandboxHandle,
  spec: StageSpec,
  dir: string,
): Promise<StageResult> {
  const controlRaw = await sandbox.readFile(`${dir}/control.json`);
  const analysis = (await sandbox.readFile(`${dir}/analysis.md`)) ?? "";
  let control: Record<string, unknown> = {};
  if (controlRaw) {
    try {
      control = JSON.parse(controlRaw) as Record<string, unknown>;
    } catch {
      throw new StageFailure(spec.id, "control", "control.json is not valid JSON");
    }
  }
  // Validate against the stage's inline control contract when declared.
  const schema = typeof spec.output?.controlSchema === "object" ? (spec.output.controlSchema as JsonSchema) : undefined;
  if (schema) {
    const errs = validateAgainstSchema(control, schema);
    if (errs.length) throw new StageFailure(spec.id, "control", `control failed schema: ${errs.join("; ")}`);
  }
  return { stageId: spec.id, control, analysis };
}

/** Trace-compatible activity doc (matches the engine path's shape). */
export interface DefActivity {
  runId: string;
  workflow: string;
  tasks: Array<{ id: string; status: "completed"; round: number; analysis: string; control: Record<string, unknown> }>;
  usage: { totalTokens: number; cost: number };
  startedAt: string;
  completedAt: string;
}

export type DefRunResult =
  | { status: "done"; result: string; outcome: "pr" | "report" | "artifact"; activity: DefActivity }
  | { status: "throttled"; retryAfterMs: number; providers: string[]; stageId: string; activity: DefActivity };

/**
 * Run one WorkflowDef to completion (one attempt). Accumulates a
 * trace-compatible activity doc via onStage; returns drop-in result/outcome
 * for the shared deliver path. Catches ThrottledPark → {status:"throttled"}
 * (the spine sleeps durably + re-invokes). Hard StageFailure throws (the
 * spine's step fails → run errors). Idempotent: a re-invoke replays completed
 * stages from disk and resumes at the throttled/failed stage.
 */
export async function runWorkflowDef(deps: WorkflowRunDeps): Promise<DefRunResult> {
  const startedAt = new Date().toISOString();
  const tasks: DefActivity["tasks"] = [];
  let tokens = 0;
  let cost = 0;
  const sandbox = sandboxDriver(deps.env, deps.sandboxId);

  const ctx = makeWorkflowContext({
    ...deps,
    onStage: async (s) => {
      await deps.onStage?.(s);
      if (s.status === "completed") {
        tasks.push({ id: s.id, status: "completed", round: s.round, analysis: s.analysis ?? "", control: s.control ?? {} });
        tokens += s.stats?.tokens?.total ?? 0;
        cost += s.stats?.cost ?? 0;
      }
    },
  });

  const activity = (): DefActivity => ({
    runId: deps.runId,
    workflow: deps.def.name,
    tasks,
    usage: { totalTokens: tokens, cost },
    startedAt,
    completedAt: new Date().toISOString(),
  });

  let wf;
  try {
    wf = await deps.def.run(ctx);
  } catch (e) {
    if (e instanceof ThrottledPark) {
      return { status: "throttled", retryAfterMs: e.retryAfterMs, providers: e.providers, stageId: e.stageId, activity: activity() };
    }
    throw e; // hard StageFailure (and anything else) fails the run
  }

  const diff = await sandbox
    .exec(`cd ${deps.cwd ?? "/workspace/repo"} && git add -A && git diff --cached --stat | tail -30`, { timeout: 60_000 })
    .catch(() => ({ stdout: "" }) as { stdout: string });
  const terminalAnalysis = tasks.at(-1)?.analysis ?? wf.summary ?? "";
  const result = `${(diff.stdout ?? "").trim()}\n\n${terminalAnalysis}`.trim();

  return { status: "done", result, outcome: wf.outcome, activity: activity() };
}

/** Build the concrete WorkflowContext for one run. */
export function makeWorkflowContext(deps: WorkflowRunDeps): WorkflowContext {
  const { env, sandboxId, selfOrigin, ticketId, repo, def, runId, task } = deps;
  const cwd = deps.cwd ?? "/workspace/repo";
  const inputs = deps.inputs ?? {};
  const sandbox = sandboxDriver(env, sandboxId);
  const runStageSession = makeStageSession(env, sandboxId, selfOrigin);
  const rounds: Record<string, number> = {};

  return {
    runId,
    task,
    inputs,
    model: deps.model,

    async stage(id: string, inv?: StageInvocation): Promise<StageResult> {
      const spec = def.stages.find((s) => s.id === id);
      if (!spec) throw new StageFailure(id, "control", `no stage "${id}" in workflow ${def.name}`);

      const round = (rounds[id] = (rounds[id] ?? 0) + 1);
      const dir = stageDir(runId, id, round);
      await sandbox.exec(`mkdir -p ${dir}`, { timeout: 15_000 });

      // Idempotent replay: this round already ran (resume after park/crash).
      // Still fire onStage(completed) so a re-invoke rebuilds a full trace —
      // replayed stages must not vanish from the accumulated tasks[].
      if ((await sandbox.readFile(`${dir}/control.json`)) != null) {
        const replayed = await readStageResult(sandbox, spec, dir);
        await deps.onStage?.({ id, status: "completed", round, control: replayed.control, analysis: replayed.analysis });
        return replayed;
      }

      // Persona from the agent block (stage agent > def default); tool ceiling.
      const agentName = spec.agent ?? def.defaults?.agent;
      const baseAgentMd = agentName
        ? await sandbox.readFile(`/root/.pi/agent/agents/${agentName}.md`)
        : null;
      const session = stageSession(spec, baseAgentMd);

      // Prompt: task + inputs + upstream digests + (loop-back) routedFrom +
      // (declared) notifications + the control epilogue.
      const upstream = (inv?.upstream ?? []).map((r) =>
        upstreamDigest(r.stageId, r.analysis, r.control, spec.output?.maxDigestChars ?? 2000),
      );
      let notifications: string | undefined;
      if (spec.notifications === "read" && deps.readNotifications) {
        notifications = (await deps.readNotifications(id).catch(() => null)) ?? undefined;
      }
      const prompt = assemblePrompt(spec, dir, {
        task,
        inputs,
        upstream,
        routedFrom: inv?.routedFrom,
        notifications,
        round,
      });
      await sandbox.writeFile(`${dir}/persona.md`, session.persona);
      await sandbox.writeFile(`${dir}/prompt.md`, prompt);

      await deps.onStage?.({ id, status: "running", round });

      const model = spec.model ?? def.defaults?.model ?? deps.model;
      const outcome = await runStageSession({
        dir,
        cwd,
        prompt,
        persona: session.persona,
        tools: session.tools,
        writeAllow: session.writeAllow,
        model,
        ticketId,
        repo,
        stageId: id,
      });

      if (!outcome.ok && "throttled" in outcome) {
        throw new ThrottledPark(id, outcome.throttled.retryAfterMs, outcome.throttled.providers);
      }
      if (!outcome.ok) throw new StageFailure(id, outcome.failure.kind, outcome.failure.detail);

      const result = await readStageResult(sandbox, spec, dir);
      result.stats = outcome.stats;
      await deps.onStage?.({ id, status: "completed", round, control: result.control, analysis: result.analysis, stats: result.stats });
      return result;
    },
  };
}
