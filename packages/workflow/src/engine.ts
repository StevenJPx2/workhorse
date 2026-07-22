// The workflow engine: run lifecycle (dispatch → advance → park → resume →
// outcome) + control verbs (steer, promote, injectInput, cancel). The
// Cloudflare Workflow spine is durability plumbing that calls advance() in
// bursts; ALL workflow semantics live here.

import type { Driver } from "./driver";
import {
  assemblePrompt,
  initialStages,
  runDir,
  stageDir,
  stageOrder,
  stageSession,
  terminalStage,
  untilSatisfied,
  upstreamDigest,
} from "./compile";
import { froms, validateAgainstSchema, validateWorkflowSpec } from "./validate";
import { digestEvents, killRpcSession, launchRpcSession, renderEvents, sendRpc, tailEvents } from "./rpc";
import type {
  FailureKind,
  JsonSchema,
  RunState,
  StageDriveReport,
  StageSpec,
  StageState,
  WorkflowSpec,
} from "./types";

const DEFAULT_STAGE_TIMEOUT_MS = 25 * 60 * 1000;

export interface EngineOptions {
  /** Pi binary (default "pi"). */
  piBin?: string;
  /** Repo working directory inside the sandbox. */
  cwd?: string;
  /**
   * Notification read point: called when launching a stage that declares
   * `notifications: "read"`; the returned section (rendered unread
   * notifications) is appended to the stage prompt. The provider marks
   * them read. Null/empty = nothing pending.
   */
  readNotifications?: (stageId: string) => Promise<string | null>;
}

export class WorkflowEngine {
  private readonly pi: string;
  private readonly cwd: string;

  private readonly readNotifications?: EngineOptions["readNotifications"];

  constructor(
    private readonly driver: Driver,
    private readonly spec: WorkflowSpec,
    opts: EngineOptions = {},
  ) {
    this.pi = opts.piBin ?? "pi";
    this.cwd = opts.cwd ?? "/workspace/repo";
    this.readNotifications = opts.readNotifications;
  }

  // ---- state I/O -----------------------------------------------------------

  private statePath(runId: string): string {
    return `${runDir(runId)}/state.json`;
  }

  async load(runId: string): Promise<RunState> {
    const raw = await this.driver.readFile(this.statePath(runId));
    if (!raw) throw new Error(`run ${runId}: no state.json`);
    return JSON.parse(raw) as RunState;
  }

  private async save(state: RunState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await this.driver.writeFile(this.statePath(state.runId), JSON.stringify(state, null, 1));
  }

  // ---- dispatch ------------------------------------------------------------

  async dispatch(
    task: string,
    opts: { runId?: string; inputs?: Record<string, string | number | boolean>; model?: string } = {},
  ): Promise<RunState> {
    const errors = validateWorkflowSpec(this.spec);
    if (errors.length) throw new Error(`invalid spec: ${errors.join("; ")}`);
    const runId = opts.runId ?? `wfrun_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    const now = new Date().toISOString();
    const state: RunState = {
      engine: "workhorse-workflow",
      version: 1,
      runId,
      workflow: this.spec.name,
      task,
      ...(opts.inputs ? { inputs: opts.inputs } : {}),
      status: "running",
      stages: initialStages(this.spec),
      createdAt: now,
      updatedAt: now,
    };
    // Eval/model override applies engine-wide via stage.model default.
    if (opts.model) for (const st of state.stages) st.model = opts.model;
    await this.driver.exec(`mkdir -p ${runDir(runId)}/stages`, { timeout: 10_000 });
    await this.save(state);
    return state;
  }

  // ---- the burst: reconcile + launch + report -------------------------------

  /**
   * Advance the run: reconcile the running stage (session exit → collect
   * control), launch the next ready stage, and — when a session is live —
   * hold the burst up to `holdMs` polling for completion. Idempotent;
   * called repeatedly by the spine.
   */
  async advance(runId: string, holdMs = 45_000): Promise<StageDriveReport> {
    const state = await this.load(runId);
    if (state.status === "completed" || state.status === "failed" || state.status === "cancelled") {
      return this.report(state);
    }

    let running = state.stages.find((s) => s.status === "running");
    if (running?.pid) {
      const dir = stageDir(state.runId, running.id, running.rounds + 1);
      // Hold the burst until the agent settles, the session dies, or the
      // hold expires — one in-sandbox watch loop, not a poll storm.
      if (holdMs > 0) {
        await this.driver.exec(
          `for i in $(seq 1 ${Math.max(1, Math.floor(holdMs / 5000))}); do ` +
            `grep -q '"type":"agent_settled"' ${dir}/events.jsonl 2>/dev/null && exit 0; ` +
            `kill -0 ${running.pid} 2>/dev/null || exit 0; sleep 5; done`,
          { timeout: holdMs + 20_000 },
        );
      }
      // Tail this burst's events and act on the digest.
      const { events, offset } = await tailEvents(this.driver, dir, running.eventsOffset ?? 0);
      running.eventsOffset = offset;
      const digest = digestEvents(events);
      if (digest.stats) running.stats = digest.stats;
      const alive = await this.pidAlive(running.pid);
      if (digest.modelFailure) {
        await killRpcSession(this.driver, dir, running.pid, running.holderPid);
        this.fail(running, "model", `model-plane failure: ${digest.modelFailure}`);
      } else if (digest.settled || !alive) {
        // Settled (or crashed): capture stats, then collect artifacts.
        if (alive && !running.stats) {
          if (await sendRpc(this.driver, dir, { type: "get_session_stats" })) {
            await this.driver.exec(`sleep 1`, { timeout: 5_000 });
            const more = await tailEvents(this.driver, dir, running.eventsOffset ?? 0);
            running.eventsOffset = more.offset;
            const d2 = digestEvents(more.events);
            if (d2.stats) running.stats = d2.stats;
          }
        }
        await killRpcSession(this.driver, dir, running.pid, running.holderPid);
        await this.collectStage(state, running);
      } else if (this.timedOut(running)) {
        await killRpcSession(this.driver, dir, running.pid, running.holderPid);
        this.fail(running, "timeout", `stage exceeded ${this.stageTimeoutMs(running)}ms`);
      }
    }

    // Launch next ready stage when nothing is running/parked.
    running = state.stages.find((s) => s.status === "running");
    if (!running && state.status === "running") {
      const next = this.nextReady(state);
      if (next) {
        await this.launch(state, next);
      } else {
        this.finalize(state);
      }
    }

    await this.save(state);
    return this.report(state);
  }

  private nextReady(state: RunState): StageState | undefined {
    const byId = new Map(this.spec.artifactGraph.stages.map((s) => [s.id, s]));
    return state.stages.find((s) => {
      if (s.status !== "pending") return false;
      const spec = byId.get(s.id);
      return spec ? froms(spec).every((f) => state.stages.find((x) => x.id === f)?.status === "completed") : false;
    });
  }

  private stageSpec(id: string): StageSpec {
    const s = this.spec.artifactGraph.stages.find((x) => x.id === id);
    if (!s) throw new Error(`unknown stage ${id}`);
    return s;
  }

  private stageTimeoutMs(_st: StageState): number {
    return this.spec.defaults?.maxRuntimeMs ?? DEFAULT_STAGE_TIMEOUT_MS;
  }

  private timedOut(st: StageState): boolean {
    return !!st.startedAt && Date.now() - new Date(st.startedAt).getTime() > this.stageTimeoutMs(st);
  }

  private async pidAlive(pid: number): Promise<boolean> {
    const r = await this.driver.exec(`kill -0 ${pid} 2>/dev/null && echo ALIVE || echo DEAD`, {
      timeout: 10_000,
    });
    return r.stdout.includes("ALIVE");
  }

  // ---- launch --------------------------------------------------------------

  private async launch(state: RunState, st: StageState): Promise<void> {
    const spec = this.stageSpec(st.id);
    const round = st.rounds + 1;
    const dir = stageDir(state.runId, st.id, round);

    // Upstream digests from completed dependencies.
    const upstream: string[] = [];
    for (const f of froms(spec)) {
      const dep = state.stages.find((x) => x.id === f);
      if (dep?.status !== "completed") continue;
      const depDir = stageDir(state.runId, f, dep.rounds);
      const analysis = await this.driver.readFile(`${depDir}/analysis.md`);
      const maxChars = this.stageSpec(f).output?.maxDigestChars ?? 2500;
      upstream.push(upstreamDigest(f, analysis, dep.control, maxChars));
    }

    // Notification read point: workflow-declared, injected at launch.
    let notifications: string | undefined;
    if (spec.notifications === "read" && this.readNotifications) {
      notifications = (await this.readNotifications(st.id).catch(() => null)) ?? undefined;
    }

    const prompt = assemblePrompt(spec, dir, {
      task: state.task,
      inputs: { ...state.inputs, ...(st.inputRequest ? {} : {}) },
      upstream,
      steer: st.steer,
      routedFrom: st.routedFrom,
      notifications,
      round,
      maxRounds: spec.maxRounds,
      previousControl: spec.type === "loop" && st.rounds > 0 ? st.control : undefined,
    });

    // Base persona: a named agent file installed in the sandbox, when set.
    const agentName = spec.agent ?? this.spec.defaults?.agent;
    const baseAgentMd = agentName
      ? await this.driver.readFile(`/root/.pi/agent/agents/${agentName}.md`)
      : null;
    const session = stageSession(spec, baseAgentMd);

    await this.driver.exec(`mkdir -p ${dir}`, { timeout: 10_000 });
    await this.driver.writeFile(`${dir}/persona.md`, session.persona);
    await this.driver.writeFile(`${dir}/prompt.md`, prompt);

    const model = st.model ?? spec.model ?? this.spec.defaults?.model;
    const thinking = spec.thinking ?? this.spec.defaults?.thinking;
    const flags = [
      "-np",
      "--no-session",
      `--append-system-prompt ${dir}/persona.md`,
      // Tool ceiling: CLI-level allowlist. No list = the stage runs open
      // (spec authors gate by listing; validation encourages it).
      ...(session.tools.length ? [`--tools ${JSON.stringify(session.tools.join(","))}`] : []),
      ...(model ? [`--model ${JSON.stringify(model)}`] : []),
      ...(thinking ? [`--thinking ${thinking}`] : []),
    ];
    const launched = await launchRpcSession(this.driver, {
      pi: this.pi,
      cwd: this.cwd,
      dir,
      flags,
      promptPath: `${dir}/prompt.md`,
      env: {
        // submit_work target (workflow-gate extension).
        WORKHORSE_STAGE_DIR: dir,
        // Glob write gate — only when the stage declares writeAllow.
        ...(session.writeAllow.length ? { WORKHORSE_WRITE_ALLOW: session.writeAllow.join(",") } : {}),
      },
    });
    if (!launched) {
      const log = (await this.driver.readFile(`${dir}/session.log`)) ?? "";
      this.fail(st, "session", `launch failed: ${log.slice(-300)}`);
      return;
    }
    st.status = "running";
    st.pid = launched.pid;
    st.holderPid = launched.holderPid;
    st.eventsOffset = 0;
    st.startedAt = st.startedAt ?? new Date().toISOString();
    st.steer = undefined; // consumed
    st.routedFrom = undefined; // consumed
    state.status = "running";
  }

  // ---- collection ----------------------------------------------------------

  private async collectStage(state: RunState, st: StageState): Promise<void> {
    const spec = this.stageSpec(st.id);
    const round = st.rounds + 1;
    const dir = stageDir(state.runId, st.id, round);
    st.pid = undefined;
    st.holderPid = undefined;

    const controlRaw = await this.driver.readFile(`${dir}/control.json`);
    if (!controlRaw) {
      // Session died without fulfilling the contract — classify.
      const log = (await this.driver.readFile(`${dir}/session.log`)) ?? "";
      const tail = log.slice(-2000);
      const kind: FailureKind = /429|rate.?limit|credit|quota|overloaded|invalid.*(api key|token)|authentication/i.test(tail)
        ? "model"
        : "control";
      this.fail(st, kind, kind === "model" ? `model-plane failure: ${tail.slice(-300)}` : "session ended without control.json");
      return;
    }
    let control: Record<string, unknown>;
    try {
      control = JSON.parse(controlRaw) as Record<string, unknown>;
    } catch {
      this.fail(st, "control", "control.json did not parse");
      return;
    }

    // Mid-run operator input request.
    const req = control.inputRequest as { title?: string; schema?: JsonSchema } | undefined;
    if (req && typeof req === "object" && req.schema) {
      st.status = "awaiting-input";
      st.inputRequest = { title: req.title, schema: req.schema };
      st.control = control;
      state.status = "awaiting-input";
      return;
    }

    // Contract validation.
    const schema = typeof spec.output?.controlSchema === "object" ? spec.output.controlSchema : undefined;
    if (schema) {
      const errs = validateAgainstSchema(control, schema);
      if (errs.length) {
        this.fail(st, "control", `control.json violates schema: ${errs.join("; ")}`);
        return;
      }
    }

    st.rounds = round;
    st.control = control;

    // Loop semantics.
    if (spec.type === "loop") {
      const doneByUntil = untilSatisfied(spec.until, control);
      const doneByRounds = spec.maxRounds !== undefined && round >= spec.maxRounds;
      if (!doneByUntil && !doneByRounds) {
        st.status = "pending"; // next advance() launches the next round
        st.eventsOffset = 0;
        return;
      }
      st.detail = doneByUntil ? `until satisfied after ${round} round(s)` : `maxRounds ${spec.maxRounds} reached`;
    }
    st.status = "completed";
    st.completedAt = new Date().toISOString();

    // Conditional routing: deterministic branching over the VALIDATED
    // control JSON — the system routes, never the agent's prose.
    await this.route(state, st, spec, control);
  }

  /** Evaluate a completed stage's `next` rules; first match routes. */
  private async route(
    state: RunState,
    st: StageState,
    spec: StageSpec,
    control: Record<string, unknown>,
  ): Promise<void> {
    const rule = (spec.next ?? []).find(
      (r) => !r.when || Object.entries(r.when).every(([k, v]) => control[k] === v),
    );
    if (!rule) return;

    if (rule.to === "$end") {
      // Skip everything not yet run — the run is done.
      for (const s of state.stages) {
        if (s.status === "pending") s.status = "skipped";
      }
      return;
    }

    const order = state.stages.map((s) => s.id);
    const targetIdx = order.indexOf(rule.to);
    if (targetIdx < 0) return; // validated at upload; belt-and-braces
    const selfIdx = order.indexOf(st.id);

    if (targetIdx <= selfIdx) {
      // LOOP-BACK (e.g. verify fail → implement). Bounded.
      const cap = spec.maxLoopbacks ?? 2;
      if ((st.loopbacks ?? 0) >= cap) {
        st.detail = `route ${st.id}→${rule.to} suppressed: loop-back cap (${cap}) reached; proceeding`;
        return;
      }
      st.loopbacks = (st.loopbacks ?? 0) + 1;
      const target = state.stages[targetIdx];
      // The routed-from verdict travels INTO the target's re-run prompt.
      const analysis =
        (await this.driver.readFile(`${stageDir(state.runId, st.id, st.rounds)}/analysis.md`)) ?? "";
      target.routedFrom = {
        stage: st.id,
        digest:
          `\`${st.id}\` verdict: ${JSON.stringify(control).slice(0, 1500)}\n\n` +
          analysis.slice(0, 3000),
      };
      // Reset the target and every stage after it (this one included) so
      // the graph re-runs from the target with the verdict in hand.
      for (let i = targetIdx; i < state.stages.length; i++) {
        const s = state.stages[i];
        if (s.status === "skipped" || s.status === "pending") continue;
        s.status = "pending";
        s.control = i === targetIdx ? s.control : undefined;
        s.completedAt = undefined;
        s.failureKind = undefined;
        s.detail = undefined;
        s.eventsOffset = 0;
        // Preserve loopback counters — they are the cycle bound.
      }
      // Fresh round dirs: bump rounds so artifacts never collide.
      state.stages[targetIdx].rounds = target.rounds; // launch() adds +1
    }
    // Forward jump: mark the stages BETWEEN self and target skipped.
    else {
      for (let i = selfIdx + 1; i < targetIdx; i++) {
        if (state.stages[i].status === "pending") state.stages[i].status = "skipped";
      }
    }
  }

  private fail(st: StageState, kind: FailureKind, detail: string): void {
    st.status = "failed";
    st.failureKind = kind;
    st.detail = detail.slice(0, 500);
    st.pid = undefined;
    st.holderPid = undefined;
  }

  private finalize(state: RunState): void {
    if (state.stages.every((s) => s.status === "completed" || s.status === "skipped")) {
      state.status = "completed";
    } else if (state.stages.some((s) => s.status === "failed")) {
      state.status = "failed";
    }
    // pending-but-unreachable (failed dependency) → skipped for clarity.
    if (state.status === "failed") {
      for (const s of state.stages) if (s.status === "pending") s.status = "skipped";
    }
  }

  // ---- control verbs ---------------------------------------------------------

  /**
   * Steer the run. A LIVE stage gets the message injected at its next
   * turn boundary — session context intact (RPC steer verb). A dead/
   * pending stage gets the classic treatment: reset + steer folded into
   * the relaunch prompt.
   */
  async steer(runId: string, message: string): Promise<string> {
    const state = await this.load(runId);
    const live = state.stages.find((s) => s.status === "running");
    if (live?.pid && (await this.pidAlive(live.pid))) {
      const dir = stageDir(state.runId, live.id, live.rounds + 1);
      const sent = await sendRpc(this.driver, dir, {
        type: "steer",
        message:
          "OPERATOR STEERING (takes precedence over conflicting parts of your task):\n" + message,
      });
      if (sent) {
        await this.save(state);
        return live.id;
      }
      // FIFO gone — fall through to the restart path.
    }
    const target =
      live ?? state.stages.find((s) => s.status === "pending" || s.status === "failed");
    if (!target) throw new Error("no steerable stage (run finished?)");
    if (target.pid) {
      const dir = stageDir(state.runId, target.id, target.rounds + 1);
      await killRpcSession(this.driver, dir, target.pid, target.holderPid);
    }
    target.pid = undefined;
    target.holderPid = undefined;
    target.status = "pending";
    target.steer = message;
    target.failureKind = undefined;
    target.detail = undefined;
    await this.invalidateDependents(state, target.id);
    state.status = "running";
    await this.save(state);
    return target.id;
  }

  /**
   * Re-run a stage on a different model (promotion / fallback). Without a
   * stageId, applies to the failed stage — or every remaining stage when
   * the failure was run-wide (model plane).
   */
  async promote(runId: string, model: string, stageId?: string): Promise<string[]> {
    const state = await this.load(runId);
    const targets = stageId
      ? state.stages.filter((s) => s.id === stageId)
      : state.stages.filter((s) => s.status === "failed");
    if (targets.length === 0) throw new Error(`no stage to promote${stageId ? ` (${stageId})` : ""}`);
    for (const st of targets) {
      // A LIVE healthy stage switches models in-session (context intact).
      if (st.status === "running" && st.pid && (await this.pidAlive(st.pid))) {
        const dir = stageDir(state.runId, st.id, st.rounds + 1);
        const [provider, ...rest] = model.includes("/") ? model.split("/") : ["anthropic", model];
        if (await sendRpc(this.driver, dir, { type: "set_model", provider, modelId: rest.join("/") || model })) {
          st.model = model;
          continue;
        }
      }
      if (st.pid) {
        const dir = stageDir(state.runId, st.id, st.rounds + 1);
        await killRpcSession(this.driver, dir, st.pid, st.holderPid);
      }
      st.pid = undefined;
      st.holderPid = undefined;
      st.status = "pending";
      st.model = model;
      st.failureKind = undefined;
      st.detail = undefined;
      await this.invalidateDependents(state, st.id);
    }
    // Model-plane failures poison every later stage on the same model.
    if (!stageId) for (const st of state.stages) if (st.status === "pending") st.model = model;
    state.status = "running";
    await this.save(state);
    return targets.map((t) => t.id);
  }

  /** Answer an awaiting-input park; the stage re-runs with the answers. */
  async injectInput(runId: string, answers: Record<string, unknown>): Promise<string> {
    const state = await this.load(runId);
    const target = state.stages.find((s) => s.status === "awaiting-input");
    if (!target) throw new Error("no stage awaiting input");
    if (target.inputRequest?.schema) {
      const errs = validateAgainstSchema(answers, target.inputRequest.schema);
      if (errs.length) throw new Error(`answers violate the requested schema: ${errs.join("; ")}`);
    }
    state.inputs = { ...state.inputs, operator: JSON.stringify(answers) as never };
    target.status = "pending";
    target.inputRequest = undefined;
    target.steer = `You previously requested operator input. The operator answered:\n${JSON.stringify(answers, null, 1)}\nProceed with these answers.`;
    state.status = "running";
    await this.save(state);
    return target.id;
  }

  /** Re-run failed stages as-is (availability retry: fresh credentials, same models). */
  async retry(runId: string): Promise<string[]> {
    const state = await this.load(runId);
    const failed = state.stages.filter((s) => s.status === "failed");
    for (const st of failed) {
      st.status = "pending";
      st.failureKind = undefined;
      st.detail = undefined;
      await this.invalidateDependents(state, st.id);
    }
    if (failed.length) state.status = "running";
    await this.save(state);
    return failed.map((s) => s.id);
  }

  async cancel(runId: string): Promise<void> {
    const state = await this.load(runId);
    for (const st of state.stages) {
      if (st.pid) {
        const dir = stageDir(state.runId, st.id, st.rounds + 1);
        await killRpcSession(this.driver, dir, st.pid, st.holderPid);
      }
      st.pid = undefined;
      st.holderPid = undefined;
      if (st.status === "running") this.fail(st, "session", "cancelled");
    }
    state.status = "cancelled";
    await this.save(state);
  }

  private async invalidateDependents(state: RunState, stageId: string): Promise<void> {
    const dependents = this.spec.artifactGraph.stages.filter((s) => froms(s).includes(stageId));
    for (const dep of dependents) {
      const st = state.stages.find((x) => x.id === dep.id);
      if (!st || st.status === "pending" || st.status === "skipped") continue;
      if (st.pid) {
        const depDir = stageDir(state.runId, st.id, st.rounds + 1);
        await killRpcSession(this.driver, depDir, st.pid, st.holderPid);
      }
      st.pid = undefined;
      st.holderPid = undefined;
      st.status = "pending";
      st.control = undefined;
      st.completedAt = undefined;
      st.failureKind = undefined;
      st.detail = undefined;
      await this.invalidateDependents(state, dep.id);
    }
  }

  // ---- reporting -------------------------------------------------------------

  report(state: RunState): StageDriveReport {
    const awaiting = state.stages.find((s) => s.status === "awaiting-input");
    const delegated = state.stages.find(
      (s) => s.status === "completed" && s.control?.delegate === true,
    );
    return {
      status: state.status,
      tasks: state.stages.map((s) => ({
        id: s.id,
        status: s.status,
        ...(s.detail ? { detail: s.detail } : {}),
      })),
      ...(state.stages.some((s) => s.status === "failed" && s.failureKind === "model")
        ? { modelFailure: true }
        : {}),
      ...(delegated
        ? {
            delegating: {
              taskId: delegated.id,
              model: delegated.model ?? this.stageSpec(delegated.id).model ?? this.spec.defaults?.model,
              reason: typeof delegated.control?.delegateReason === "string" ? delegated.control.delegateReason : undefined,
            },
          }
        : {}),
      ...(awaiting?.inputRequest
        ? { awaitingInput: { stageId: awaiting.id, request: awaiting.inputRequest } }
        : {}),
    };
  }

  /** The run's declared outcome (terminal stage; default "pr"). */
  outcome(): "pr" | "report" | "artifact" {
    return terminalStage(this.spec).outcome ?? "pr";
  }

  /** Final artifacts for delivery: terminal analysis + all stage analyses. */
  async collect(runId: string): Promise<{
    analysis: string;
    stages: Array<{ id: string; status: string; analysis: string | null; control?: Record<string, unknown> }>;
  }> {
    const state = await this.load(runId);
    const stages: Array<{ id: string; status: string; analysis: string | null; control?: Record<string, unknown> }> = [];
    for (const st of state.stages) {
      const dir = stageDir(runId, st.id, Math.max(1, st.rounds));
      stages.push({
        id: st.id,
        status: st.status,
        analysis: await this.driver.readFile(`${dir}/analysis.md`),
        ...(st.control ? { control: st.control } : {}),
      });
    }
    const terminal = terminalStage(this.spec);
    const analysis = stages.find((s) => s.id === terminal.id)?.analysis ?? stages.at(-1)?.analysis ?? "";
    return { analysis: analysis ?? "", stages };
  }

  /** Activity document for the UI/trace archive (shape-compatible with the ticket page). */
  async activity(runId: string): Promise<Record<string, unknown>> {
    const state = await this.load(runId);
    const tasks: Array<Record<string, unknown>> = [];
    for (const st of state.stages) {
      const dir = stageDir(runId, st.id, Math.max(1, st.rounds));
      // Structured transcript from RPC events; stderr as the fallback.
      let output: string | null = null;
      const { events } = await tailEvents(this.driver, dir, 0);
      if (events.length) output = renderEvents(events).slice(-4000);
      if (!output) output = (await this.driver.readFile(`${dir}/session.log`))?.slice(-4000) ?? null;
      tasks.push({
        id: st.id,
        status: st.status,
        startedAt: st.startedAt,
        completedAt: st.completedAt,
        events: [],
        prompt: (await this.driver.readFile(`${dir}/prompt.md`))?.slice(0, 4000) ?? null,
        analysis: (await this.driver.readFile(`${dir}/analysis.md`))?.slice(-6000) ?? null,
        output,
        ...(st.stats ? { stats: st.stats } : {}),
        ...(st.detail ? { detail: st.detail } : {}),
        ...(st.failureKind ? { failureKind: st.failureKind } : {}),
      });
    }
    return {
      runId,
      engine: "workhorse-workflow",
      status: state.status,
      startedAt: state.createdAt,
      completedAt: state.status === "completed" ? state.updatedAt : undefined,
      tasks,
    };
  }

  static order = stageOrder;
}
