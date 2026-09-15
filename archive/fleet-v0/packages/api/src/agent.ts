// `agent()` — the authoring primitive for one workflow stage.
//
// Sits beside `tool()` for the same reason: both are pure declarations with no
// runtime, so a workflow package can depend on @workhorse/api without pulling in
// an execution engine. The engine (@workhorse/workflow) consumes what this
// produces; it does not define it.
//
// An agent is DECLARATIVE. It names a persona, an output contract, and the tools
// it may use. It does not know which workflow runs it, what ran before it, or how
// many times it will be invoked — that is the workflow's business.

import type { GenericSchema, InferOutput } from "valibot";
import type { ToolFactory } from "./plugin";

/** An agent's output contract. Validated at runtime, inferred at compile time. */
export type AgentOutputSchema = GenericSchema<any, any>;

/** How much the model should deliberate before acting. */
export type Thinking = "minimal" | "low" | "medium" | "high";

/**
 * Model selection as a POLICY, not a string. Two orthogonal axes — conflating
 * them is expensive:
 *
 *   fallback  the PROVIDER failed (429/401/5xx/network) → same capability,
 *             different credential. Free.
 *   promote   the AGENT failed (budget spent, no submit_work) → higher
 *             capability. Costs more.
 *
 * Fallback is exhausted FIRST: a throttle is not a capability problem, so
 * promoting on one pays for a bigger model to fix something it cannot fix.
 */
export interface ModelPolicy {
  primary: string;
  /** Same capability, other credentials. Tried in order on provider failure. */
  fallback?: string[];
  /** A bigger model, only when the work itself stalls. */
  promote?: {
    to: string;
    when?: {
      /** Promote after this many tokens without finishing. */
      tokenBudget?: number;
      /** Promote after this many sessions that ended without submit_work. */
      retriesWithoutSubmit?: number;
    };
  };
}

/**
 * Tools the ENGINE provides, which cannot be imported as factories.
 *
 * Both run inside the Code Mode bridge, which needs the stage's authentic
 * `ctx.props` — a plugin ToolContext cannot reach those, so there is no factory to
 * import. A union rather than free strings: the old stage specs asked for
 * `find_workflow`, which no tool answers to, and a phantom name in a string
 * allowlist resolves to nothing without complaint.
 *
 * `submit_work` is not listed. Every agent gets it, so declaring it would be
 * ceremony an author could forget.
 */
export type EngineTool = "run_code" | "run_script";

/** What an agent's `tools` function may branch on. */
export interface AgentToolContext {
  /** The typed input this invocation was given by `ctx.run(agent, { input })`. */
  input: Record<string, unknown>;
}

export interface AgentSpec<TOutput extends AgentOutputSchema> {
  /** Stable id. Also the stage id in a workflow graph, so keep it kebab-case. */
  name: string;
  /** A bare string is shorthand for `{ primary }`. */
  model?: string | ModelPolicy;
  /** The persona and the stage's instructions — becomes the system prompt. */
  instructions: string;
  /**
   * The ENTIRE output, as a valibot schema: validated at runtime, and the source
   * of the compile-time type via `v.InferOutput`. One schema rather than a
   * separate type declaration, because two sources of truth drift.
   */
  output: TOutput;
  /**
   * Tools this agent may call, as imported instances — not string names, so a
   * typo is a compile error and the dependency is visible to the bundler.
   *
   * A function form receives the invocation's input, which is how one agent
   * covers a conditional surface (e.g. add browser tools only when the change
   * is visual) without becoming two near-identical agents.
   */
  tools?: ToolFactory[] | ((ctx: AgentToolContext) => ToolFactory[]);
  /**
   * Engine-provided tools this agent may call, by name.
   *
   * Separate from `tools` because these have no importable factory — see
   * {@link EngineTool}. The union keeps a typo a compile error, which a plain
   * string allowlist could not.
   */
  engineTools?: EngineTool[];
  thinking?: Thinking;
  /** No repo writes at all. Stronger than an empty writeAllow. */
  readOnly?: boolean;
  /** Globs this agent may write. Empty means the stage's artifact dir only. */
  writeAllow?: string[];
  /** Inject unread operator notifications into this agent's prompt at launch. */
  notifications?: "read";
}

/** A built agent. Produced by {@link agent}; consumed by the workflow engine. */
export interface AgentDefinition<TOutput extends AgentOutputSchema = AgentOutputSchema> {
  readonly name: string;
  readonly model?: ModelPolicy;
  readonly instructions: string;
  readonly output: TOutput;
  readonly thinking?: Thinking;
  readonly readOnly?: boolean;
  readonly writeAllow?: string[];
  readonly notifications?: "read";
  readonly engineTools?: EngineTool[];
  /** Resolve the tool surface for one invocation. */
  tools(ctx: AgentToolContext): ToolFactory[];
}

/** The type an agent's stage produces — `InferOutput` of its schema. */
export type AgentOutput<A> = A extends AgentDefinition<infer S> ? InferOutput<S> : never;

/** Normalize the string shorthand into a full policy. */
function toPolicy(model: string | ModelPolicy | undefined): ModelPolicy | undefined {
  if (model === undefined) return undefined;
  return typeof model === "string" ? { primary: model } : model;
}

/**
 * Declare one agent.
 *
 * Returns a frozen definition: an agent is shared across every invocation and
 * often across workflows, so a stage mutating one would silently change another's
 * behaviour.
 */
export function agent<const TOutput extends AgentOutputSchema>(
  spec: AgentSpec<TOutput>,
): AgentDefinition<TOutput> {
  const tools = spec.tools ?? [];

  return Object.freeze({
    name: spec.name,
    model: toPolicy(spec.model),
    instructions: spec.instructions,
    output: spec.output,
    thinking: spec.thinking,
    readOnly: spec.readOnly,
    writeAllow: spec.writeAllow,
    notifications: spec.notifications,
    engineTools: spec.engineTools,
    tools: (ctx: AgentToolContext) => (typeof tools === "function" ? tools(ctx) : tools),
  });
}
