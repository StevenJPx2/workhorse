// Compile an AgentDefinition into one stage session.
//
// An agent carries its persona and tool factories directly. The ceiling is
// derived from real imports rather than names that might resolve to nothing.
//
// The control contract is derived from the agent's valibot schema, so the epilogue
// the model reads and the validation its output faces come from ONE declaration.

import type { AgentDefinition, ToolFactory } from "@workhorse/api";
import { toJsonSchema } from "@valibot/to-json-schema";

/** Everything a harness needs to run one agent. */
export interface AgentSession {
  /** Tool ceiling: the agent's tools plus submit_work. */
  tools: string[];
  /** The factories themselves, for the surface that instantiates them. */
  factories: ToolFactory[];
  /** System prompt: the agent's instructions plus any write policy. */
  persona: string;
  /** Repo-write allowlist. A readOnly agent gets an empty one. */
  writeAllow: string[];
  /** JSON-schema form of the agent's `control` object, for the epilogue. */
  controlSchema?: Record<string, unknown>;
}

/**
 * The `control` sub-schema as JSON Schema, or undefined when the agent declares
 * no control fields.
 *
 * The model is told the contract in the prompt and its output is validated against
 * the same valibot schema, so a mismatch between what we ask for and what we accept
 * is impossible by construction.
 */
function controlJsonSchema(output: unknown): Record<string, unknown> | undefined {
  const entries = (output as { entries?: Record<string, unknown> })?.entries;
  const control = entries?.control;
  if (!control) return undefined;

  try {
    const schema = toJsonSchema(control as never) as Record<string, unknown>;
    // An empty object schema tells the model nothing; the epilogue's generic
    // `{"status":"done"}` guidance is more useful than `{}`.
    const props = schema.properties as Record<string, unknown> | undefined;
    return props && Object.keys(props).length ? schema : undefined;
  } catch {
    // A schema with a validation action to-json-schema cannot express should not
    // fail the run — the valibot parse still enforces the real contract.
    return undefined;
  }
}

/**
 * Build the session config for one agent invocation.
 *
 * `input` is the invocation's typed input, which the agent's `tools` function may
 * branch on — so the tool surface is resolved per invocation, not per agent.
 */
export function agentSession(agent: AgentDefinition, input: Record<string, unknown> = {}): AgentSession {
  const factories = agent.tools({ input });
  // Engine tools ride the NAME allowlist only. They have no factory to import —
  // both run through the Code Mode bridge, which needs the stage's authentic
  // props — so the harness supplies them and the ceiling just has to permit them.
  const tools = [...factories.map((f) => f.toolName), ...(agent.engineTools ?? [])];

  // One tool per task: finishing is submit_work's job, so a stage never needs
  // general write capability just to complete.
  if (!tools.includes("submit_work")) tools.push("submit_work");

  // readOnly is stronger than an empty allowlist: empty means "no policy set",
  // which the write gate treats as open. A readOnly agent gets a policy that
  // matches nothing.
  const writeAllow = agent.readOnly ? ["\u0000never"] : (agent.writeAllow ?? []);

  let persona = agent.instructions.trim();
  if (agent.readOnly) {
    persona += "\n\nWrite policy (mechanically enforced): this stage cannot modify the repository.";
  } else if (writeAllow.length) {
    persona +=
      "\n\nWrite policy (mechanically enforced): file writes/edits are only permitted on paths matching " +
      `these patterns: ${writeAllow.join(", ")}.`;
  }

  return { tools, factories, persona, writeAllow, controlSchema: controlJsonSchema(agent.output) };
}

/** The completion contract, derived from the agent's own output schema. */
export function agentEpilogue(session: AgentSession, dir: string): string {
  const { controlSchema } = session;

  return [
    "## Completion contract (mandatory)",
    "",
    "Finish by calling the `submit_work` tool EXACTLY ONCE with:",
    "- `analysis` — your findings/summary for the next stage and the human reviewer (markdown).",
    "- `control` — a single JSON object." +
      (controlSchema
        ? ` It MUST match this schema:\n\n\`\`\`json\n${JSON.stringify(controlSchema, null, 1)}\n\`\`\``
        : ' Include at least `{"status": "done"}`.'),
    "",
    `(submit_work writes the artifacts into \`${dir}\`.)`,
    "",
    "Escape hatches inside `control` (use only when true):",
    '- `"delegate": true, "delegateReason": "…"` — this task genuinely exceeds your capability (not merely hard); a stronger model will re-run the stage.',
    '- `"inputRequest": {"title": "…", "schema": {JSON schema}}` — you need operator input to proceed; the run parks until they answer, then this stage re-runs with `inputs.operator` filled.',
    "",
    "The run advances ONLY when control.json exists and parses. Do not claim completion in prose.",
  ].join("\n");
}
