// Graph discovery: derive a workflow's stage graph by RUNNING its run() with a
// recording context instead of a model.
//
// The alternative is an explicit `agents: [...]` array beside run(), which is a
// second source of truth that drifts the moment someone adds a ctx.run() call and
// forgets the array. Here the code IS the declaration.
//
// The hard part is branching. run() routes on two different kinds of value, so
// discovery varies both and unions everything it observes:
//
//   stub POLARITY  — stage OUTPUT (a "fail" verdict, a non-empty todo array, a
//                    true uiChanges). See stub.ts.
//   run SEED       — the run's own identity, which workflows branch on: a
//                   revision run is detected as `ctx.runId.includes("-rev")`, and
//                   under a single plain runId its whole therapist arm is
//                   invisible.
//
// Every seed is walked under every polarity, so the passes are seeds × polarities.
//
// LIMIT, stated plainly: this observes the paths those combinations reach. A branch
// on a value none of them produces (a specific string, a count of 7) stays
// unrecorded — a workflow with such a branch should declare an extra seed. This is
// enough for a graph view and a tool-gating manifest; it is not a substitute for
// the eval that exercises real routing.

import type { AgentDefinition } from "@workhorse/api";
import { POLARITIES, stubFromSchema } from "./stub";

/** One observed invocation of an agent. */
export interface DiscoveredStage {
  /** Stage id — the agent's name. */
  id: string;
  /** The agent that runs here. */
  agent: AgentDefinition;
  /** Stage ids whose results were passed as `upstream`, in first-seen order. */
  upstream: string[];
  /** Input keys seen across all observed invocations. */
  inputKeys: string[];
  /** True when discovery saw this stage invoked more than once in one pass. */
  repeated: boolean;
}

/** A directed edge from an upstream stage to a dependent. */
export interface DiscoveredEdge {
  from: string;
  to: string;
}

export interface DiscoveredGraph {
  /** Stages in first-observed order — the pipeline's natural reading order. */
  stages: DiscoveredStage[];
  edges: DiscoveredEdge[];
  /**
   * Stage ids observed running more than once in a single pass: a review loop,
   * or a per-todo body. Not an error — a workflow's shape, made visible.
   */
  loops: string[];
}

/**
 * A stage result during discovery. Shaped like a real RunResult so a run() body
 * reads it without special-casing, and tagged so `upstream` resolves to stage ids.
 *
 * Fields are deliberately loose (`any` output, `unknown` control values): run()
 * bodies branch on arbitrary control fields, and requiring a cast at every
 * property access would make discovery tests unreadable while proving nothing —
 * the real types come from the agent's schema at execution time.
 */
export interface StubResult {
  __stageId: string;
  stageId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- discovery is schema-agnostic by design
  output: any;
  /** `output.control`, which existing run() bodies read directly. */
  control: Record<string, unknown>;
  /** `output.analysis`. */
  analysis: string;
}

/** What run() receives during discovery. Mirrors the real context's surface. */
export interface DiscoveryContext {
  runId: string;
  task: string;
  inputs: Record<string, string | number | boolean>;
  model?: string;
  run(
    agent: AgentDefinition,
    options?: { input?: Record<string, unknown>; upstream?: unknown[]; routedFrom?: { stage: string; digest: string } },
  ): Promise<StubResult>;
}

function isStubResult(v: unknown): v is StubResult {
  return typeof v === "object" && v !== null && "__stageId" in v;
}

/** Accumulates observations across polarity passes. */
class Recorder {
  private readonly order: string[] = [];
  private readonly byId = new Map<string, { agent: AgentDefinition; upstream: Set<string>; inputKeys: Set<string> }>();
  private readonly edgeSet = new Set<string>();
  private readonly loopIds = new Set<string>();

  /** Per-pass visit counts, so a loop is detected within a pass, not across them. */
  private visitsThisPass = new Map<string, number>();

  startPass(): void {
    this.visitsThisPass = new Map();
  }

  record(agent: AgentDefinition, upstreamIds: string[], inputKeys: string[]): void {
    const id = agent.name;

    let entry = this.byId.get(id);
    if (!entry) {
      entry = { agent, upstream: new Set(), inputKeys: new Set() };
      this.byId.set(id, entry);
      this.order.push(id);
    }

    for (const u of upstreamIds) {
      entry.upstream.add(u);
      this.edgeSet.add(`${u}\u0000${id}`);
    }
    for (const k of inputKeys) entry.inputKeys.add(k);

    const seen = (this.visitsThisPass.get(id) ?? 0) + 1;
    this.visitsThisPass.set(id, seen);
    if (seen > 1) this.loopIds.add(id);
  }

  graph(): DiscoveredGraph {
    return {
      stages: this.order.map((id) => {
        const e = this.byId.get(id)!;
        return {
          id,
          agent: e.agent,
          upstream: [...e.upstream],
          inputKeys: [...e.inputKeys],
          repeated: this.loopIds.has(id),
        };
      }),
      edges: [...this.edgeSet].map((k) => {
        const [from, to] = k.split("\u0000");
        return { from, to };
      }),
      loops: [...this.loopIds],
    };
  }
}

/** Guard against a run() whose loop never terminates under stub values. */
const MAX_STAGE_INVOCATIONS = 500;

/** One run identity to walk. */
export interface DiscoverySeed {
  runId?: string;
  task?: string;
  inputs?: Record<string, string | number | boolean>;
}

export interface DiscoverOptions {
  /** Base identity for the first seed. */
  runId?: string;
  task?: string;
  inputs?: Record<string, string | number | boolean>;
  /**
   * Extra run identities to walk, for branches keyed on the run itself rather
   * than on stage output. Defaults cover the one convention the fleet has: a
   * `-rev` suffix marks a revision run.
   */
  seeds?: DiscoverySeed[];
}

/**
 * Every seed to walk: the base identity, plus a `-rev` variant, plus any the
 * caller declared.
 *
 * The `-rev` seed is not a special case bolted on — it is the spine's actual
 * convention for re-invoking a workflow with PR feedback, and a workflow that
 * routes on it has a whole arm (feedback collation) that no output stub reaches.
 */
function seedsFor(options: DiscoverOptions): DiscoverySeed[] {
  const base: DiscoverySeed = {
    runId: options.runId ?? "discover",
    task: options.task ?? "(discovery pass — no real task)",
    inputs: options.inputs ?? {},
  };

  return [base, { ...base, runId: `${base.runId}-rev1` }, ...(options.seeds ?? [])];
}

/**
 * Run `run()` under every seed × polarity and union what it did.
 *
 * Exceptions from run() are swallowed per pass: a workflow may reasonably throw
 * on stub data (a required field parsed as ""), and one failed pass should not
 * cost us the edges another found. Everything observed before the throw is kept.
 */
export async function discoverGraph(
  run: (ctx: DiscoveryContext) => Promise<unknown>,
  options: DiscoverOptions = {},
): Promise<DiscoveredGraph> {
  const recorder = new Recorder();
  const passes = seedsFor(options).flatMap((seed) => POLARITIES.map((polarity) => ({ seed, polarity })));

  for (const { seed, polarity } of passes) {
    recorder.startPass();
    let invocations = 0;

    const ctx: DiscoveryContext = {
      runId: seed.runId ?? "discover",
      task: seed.task ?? "(discovery pass — no real task)",
      inputs: seed.inputs ?? {},

      async run(agent, options) {
        if (++invocations > MAX_STAGE_INVOCATIONS) {
          throw new Error(
            `discovery exceeded ${MAX_STAGE_INVOCATIONS} stage invocations — run() likely loops without a stub-reachable exit`,
          );
        }

        const upstreamIds = (options?.upstream ?? []).filter(isStubResult).map((r) => r.__stageId);
        recorder.record(agent, upstreamIds, Object.keys(options?.input ?? {}));

        const output = stubFromSchema(agent.output, polarity) as Record<string, unknown> | null;
        const control = (output?.control as Record<string, unknown>) ?? {};
        const analysis = typeof output?.analysis === "string" ? output.analysis : "";

        return { __stageId: agent.name, stageId: agent.name, output, control, analysis };
      },
    };

    try {
      await run(ctx);
    } catch {
      // Kept deliberately silent. A throw here means the workflow rejected stub
      // data, which says nothing about its graph — and the edges recorded before
      // it are still true.
    }
  }

  return recorder.graph();
}
