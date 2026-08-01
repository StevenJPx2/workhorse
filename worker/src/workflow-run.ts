// Run a workflow() definition inside the ticket's sandbox.
//
// A workflow calls ctx.run(agent, options). The agent owns its instructions,
// output schema, tool factories, and engine-tool declarations. This module owns
// durable replay, prompt assembly, model execution, and activity reporting.

import type { AgentDefinition, AgentOutput, Env, SandboxHandle } from "@workhorse/api";
import {
  agentSession,
  assembleAgentPrompt,
  StageFailure,
  stageDir,
  ThrottledPark,
  type AgentOutputOf,
  type RunContext,
  type RunOptions,
  type RunResult,
  type WorkflowDefinition,
  type WorkflowOutcome,
  upstreamDigest,
} from "@workhorse/workflow";
import { sandboxDriver } from "@workhorse/sandbox";
import * as v from "valibot";
import { makeStageSession } from "./flue-session";

export interface WorkflowRunDeps {
  env: Env;
  sandboxId: string;
  selfOrigin: string;
  ticketId: string;
  repo: string;
  workflow: WorkflowDefinition;
  runId: string;
  task: string;
  inputs?: Record<string, string | number | boolean>;
  model?: string;
  cwd?: string;
  onStage?: (stage: {
    id: string;
    status: "running" | "completed";
    round: number;
    control?: Record<string, unknown>;
    analysis?: string;
    stats?: RunResult["stats"];
  }) => Promise<void>;
  readNotifications?: (stageId: string) => Promise<string | null>;
  readSteers?: (stageId: string) => Promise<string | null>;
}

export interface WorkflowActivity {
  runId: string;
  workflow: string;
  tasks: Array<{
    id: string;
    status: "completed";
    round: number;
    analysis: string;
    control: Record<string, unknown>;
  }>;
  usage: { totalTokens: number; cost: number; runCodeCalls: number };
  startedAt: string;
  completedAt: string;
}

export type WorkflowRunResult =
  | { status: "done"; result: string; outcome: "pr" | "report" | "artifact"; activity: WorkflowActivity }
  | { status: "throttled"; retryAfterMs: number; providers: string[]; stageId: string; activity: WorkflowActivity };

/** Read and validate the artifacts written by submit_work. */
async function readAgentResult<A extends AgentDefinition>(
  sandbox: SandboxHandle,
  agent: A,
  dir: string,
): Promise<RunResult<AgentOutputOf<A>>> {
  const controlRaw = await sandbox.readFile(`${dir}/control.json`);
  const analysis = (await sandbox.readFile(`${dir}/analysis.md`)) ?? "";
  let control: Record<string, unknown> = {};

  if (controlRaw) {
    try {
      control = JSON.parse(controlRaw) as Record<string, unknown>;
    } catch {
      throw new StageFailure(agent.name, "control", "control.json is not valid JSON");
    }
  }

  const parsed = v.safeParse(agent.output, { control, analysis });
  if (!parsed.success) {
    const detail = parsed.issues.map((issue) => issue.message).join("; ");
    throw new StageFailure(agent.name, "control", `agent output failed schema: ${detail}`);
  }

  const output = parsed.output as AgentOutput<A>;
  const fields = output as { control?: unknown; analysis?: unknown };
  return {
    stageId: agent.name,
    output,
    control: isRecord(fields.control) ? fields.control : {},
    analysis: typeof fields.analysis === "string" ? fields.analysis : analysis,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Run one workflow definition to completion, or return a durable throttle park. */
export async function runWorkflow(deps: WorkflowRunDeps): Promise<WorkflowRunResult> {
  const startedAt = new Date().toISOString();
  const tasks: WorkflowActivity["tasks"] = [];
  let tokens = 0;
  let cost = 0;
  let runCodeCalls = 0;
  const sandbox = sandboxDriver(deps.env, deps.sandboxId);

  const context = makeRunContext(deps, async (stage) => {
    await deps.onStage?.(stage);
    if (stage.status !== "completed") return;

    tasks.push({
      id: stage.id,
      status: "completed",
      round: stage.round,
      analysis: stage.analysis ?? "",
      control: stage.control ?? {},
    });
    tokens += stage.stats?.tokens?.total ?? 0;
    cost += stage.stats?.cost ?? 0;
    runCodeCalls += stage.stats?.runCodeCalls ?? 0;
  });

  const activity = (): WorkflowActivity => ({
    runId: deps.runId,
    workflow: deps.workflow.name,
    tasks,
    usage: { totalTokens: tokens, cost, runCodeCalls },
    startedAt,
    completedAt: new Date().toISOString(),
  });

  let outcome: WorkflowOutcome;
  try {
    outcome = await deps.workflow.run(context);
  } catch (error) {
    if (error instanceof ThrottledPark) {
      return {
        status: "throttled",
        retryAfterMs: error.retryAfterMs,
        providers: error.providers,
        stageId: error.stageId,
        activity: activity(),
      };
    }
    throw error;
  }

  const diff = await sandbox
    .exec(`cd ${deps.cwd ?? "/workspace/repo"} && git add -A && git diff --cached --stat | tail -30`, { timeout: 60_000 })
    .catch(() => ({ stdout: "" }) as { stdout: string });
  const terminalAnalysis = tasks.at(-1)?.analysis ?? outcome.summary ?? "";
  const result = `${(diff.stdout ?? "").trim()}\n\n${terminalAnalysis}`.trim();

  return { status: "done", result, outcome: outcome.outcome, activity: activity() };
}

function makeRunContext(
  deps: WorkflowRunDeps,
  onStage: NonNullable<WorkflowRunDeps["onStage"]>,
): RunContext {
  const { env, sandboxId, selfOrigin, ticketId, repo, runId, task } = deps;
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

    async run<A extends AgentDefinition>(
      agent: A,
      options: RunOptions = {},
    ): Promise<RunResult<AgentOutputOf<A>>> {
      const round = (rounds[agent.name] = (rounds[agent.name] ?? 0) + 1);
      const dir = stageDir(runId, agent.name, round);
      await sandbox.exec(`mkdir -p ${dir}`, { timeout: 15_000 });

      if ((await sandbox.readFile(`${dir}/control.json`)) != null) {
        const replayed = await readAgentResult(sandbox, agent, dir);
        await onStage({ id: agent.name, status: "completed", round, control: replayed.control, analysis: replayed.analysis });
        return replayed;
      }

      const session = agentSession(agent, options.input ?? {});
      const upstream = (options.upstream ?? []).map((result) =>
        upstreamDigest(result.stageId, result.analysis, result.control, 2000),
      );
      const notifications = agent.notifications === "read" && deps.readNotifications
        ? (await deps.readNotifications(agent.name).catch(() => null)) ?? undefined
        : undefined;
      const steer = (await deps.readSteers?.(agent.name).catch(() => null)) ?? undefined;
      const prompt = assembleAgentPrompt(agent, session, dir, {
        task,
        inputs,
        input: options.input,
        upstream,
        routedFrom: options.routedFrom,
        notifications,
        steer,
        round,
      });

      await sandbox.writeFile(`${dir}/persona.md`, session.persona);
      await sandbox.writeFile(`${dir}/prompt.md`, prompt);
      await onStage({ id: agent.name, status: "running", round });

      const outcome = await runStageSession({
        dir,
        cwd,
        prompt,
        persona: session.persona,
        tools: session.tools,
        writeAllow: session.writeAllow,
        model: agent.model?.primary ?? deps.model,
        ticketId,
        repo,
        stageId: agent.name,
      });

      if (!outcome.ok && "throttled" in outcome) {
        throw new ThrottledPark(agent.name, outcome.throttled.retryAfterMs, outcome.throttled.providers);
      }
      if (!outcome.ok) throw new StageFailure(agent.name, outcome.failure.kind, outcome.failure.detail);

      const result = await readAgentResult(sandbox, agent, dir);
      result.stats = outcome.stats;
      await onStage({ id: agent.name, status: "completed", round, control: result.control, analysis: result.analysis, stats: result.stats });
      return result;
    },
  };
}
