// Score a model's tool choice against an expectation.
//
// The unit of measurement is the FIRST tool call: did the model reach for the
// right tool, with the right action, carrying the right arguments. That is the
// property a tool surface either has or doesn't — and the one thing a mocked
// test can never tell you.

import type { ModelClient, ToolCall } from "./client";
import type { ModelTool } from "./surface";

/** What a task's correct first tool call looks like. */
export interface Expectation {
  /** Tool name the model should call. */
  tool: string;
  /** Required `action` value, for consolidated tools. */
  action?: string;
  /**
   * Argument assertions. A string/number/boolean must match exactly; a RegExp
   * must match the stringified value; a function returns true when acceptable.
   */
  args?: Record<string, string | number | boolean | RegExp | ((value: unknown) => boolean)>;
  /** Extra assertion over the whole call, for anything the above can't express. */
  check?: (call: ToolCall) => string | null;
}

/** One scored task. */
export interface Task {
  id: string;
  /** What the agent is asked to do. */
  prompt: string;
  /** Expectation per surface name, so one task scores several surfaces. */
  expect: Record<string, Expectation>;
}

export interface Attempt {
  ok: boolean;
  /** Why it failed — the actual call, so a failure is diagnosable. */
  why?: string;
  called?: string;
}

export interface TaskResult {
  id: string;
  passes: number;
  runs: number;
  attempts: Attempt[];
}

export interface SurfaceResult {
  surface: string;
  tasks: TaskResult[];
  /** Passed / total across every task and run. */
  passed: number;
  total: number;
  rate: number;
  /** Mean prompt tokens the provider reported. */
  avgPromptTokens: number;
  weight: { tools: number; tokens: number };
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.slice(0, 60));
  return JSON.stringify(value)?.slice(0, 60) ?? String(value);
}

/** Compare one call against an expectation; null means it passed. */
export function judge(call: ToolCall | undefined, expect: Expectation): string | null {
  if (!call) return "no tool call";
  if (call.name !== expect.tool) return `called ${call.name}, want ${expect.tool}`;

  if (expect.action !== undefined && call.args.action !== expect.action) {
    return `action=${describe(call.args.action)}, want "${expect.action}"`;
  }

  for (const [key, matcher] of Object.entries(expect.args ?? {})) {
    const actual = call.args[key];
    const ok =
      matcher instanceof RegExp
        ? matcher.test(String(actual ?? ""))
        : typeof matcher === "function"
          ? matcher(actual)
          : actual === matcher;
    if (!ok) return `${key}=${describe(actual)}`;
  }

  return expect.check?.(call) ?? null;
}

export interface RunOptions {
  client: ModelClient;
  /** Named surfaces to compare, e.g. { granular: [...], consolidated: [...] }. */
  surfaces: Record<string, ModelTool[]>;
  tasks: Task[];
  /** Repeats per task — more runs, less noise. Default 3. */
  runs?: number;
  system?: string;
  /** Called after each task so a long run shows progress. */
  onProgress?: (surface: string, task: TaskResult) => void;
}

const DEFAULT_SYSTEM =
  "You are a coding agent working in a repository with browser access. " +
  "Use the provided tools to accomplish the user's request. Call exactly one tool.";

/**
 * Run every task against every surface and score the first tool call.
 *
 * Surfaces are compared on IDENTICAL tasks with an IDENTICAL model at
 * temperature 0, so a difference in accuracy is attributable to the surface.
 */
export async function runToolChoiceEval(options: RunOptions): Promise<SurfaceResult[]> {
  const runs = options.runs ?? 3;
  const system = options.system ?? DEFAULT_SYSTEM;
  const tally = { promptTokens: 0, sampled: 0 };

  /** Score one task on one surface, repeated `runs` times. */
  const scoreTask = async (task: Task, surface: string, tools: ModelTool[]): Promise<TaskResult> => {
    const expect = task.expect[surface];
    if (!expect) throw new Error(`task "${task.id}" has no expectation for surface "${surface}"`);

    const attempts: Attempt[] = [];
    for (let r = 0; r < runs; r++) {
      const res = await options.client.complete({ system, prompt: task.prompt, tools });

      if (res.usage?.prompt_tokens) {
        tally.promptTokens += res.usage.prompt_tokens;
        tally.sampled++;
      }

      if (res.error) {
        attempts.push({ ok: false, why: res.error });
        continue;
      }

      const why = judge(res.calls[0], expect);
      attempts.push({ ok: !why, why: why ?? undefined, called: res.calls[0]?.name });
    }

    return { id: task.id, passes: attempts.filter((a) => a.ok).length, runs, attempts };
  };

  const out: SurfaceResult[] = [];

  for (const [surface, tools] of Object.entries(options.surfaces)) {
    tally.promptTokens = 0;
    tally.sampled = 0;
    const tasks: TaskResult[] = [];

    for (const task of options.tasks) {
      const result = await scoreTask(task, surface, tools);
      tasks.push(result);
      options.onProgress?.(surface, result);
    }

    const passed = tasks.reduce((n, t) => n + t.passes, 0);
    const total = tasks.reduce((n, t) => n + t.runs, 0);

    out.push({
      surface,
      tasks,
      passed,
      total,
      rate: total ? (passed / total) * 100 : 0,
      avgPromptTokens: tally.sampled ? Math.round(tally.promptTokens / tally.sampled) : 0,
      weight: { tools: tools.length, tokens: Math.round(JSON.stringify(tools).length / 4) },
    });
  }

  return out;
}

/** Render a comparison table for the console. */
export function formatComparison(results: SurfaceResult[], model: string): string {
  const names = results.map((r) => r.surface);
  const width = Math.max(20, ...results[0].tasks.map((t) => t.id.length));
  const col = (s: string) => s.padStart(Math.max(12, ...names.map((n) => n.length + 2)));

  const lines: string[] = [
    "",
    "=".repeat(width + names.length * 14),
    `Tool-surface comparison — ${model}, ${results[0].tasks[0]?.runs ?? 0} run(s)/task, temperature 0`,
    "=".repeat(width + names.length * 14),
    "",
    `${"task".padEnd(width)}${names.map(col).join("")}`,
    "-".repeat(width + names.length * 14),
  ];

  for (let i = 0; i < results[0].tasks.length; i++) {
    const cells = results.map((r) => col(`${r.tasks[i].passes}/${r.tasks[i].runs}`));
    const differs = new Set(results.map((r) => r.tasks[i].passes)).size > 1;
    lines.push(`${results[0].tasks[i].id.padEnd(width)}${cells.join("")}${differs ? "  <-- differs" : ""}`);
  }

  lines.push(
    "-".repeat(width + names.length * 14),
    `${"accuracy".padEnd(width)}${results.map((r) => col(`${r.rate.toFixed(1)}%`)).join("")}`,
    `${"tools".padEnd(width)}${results.map((r) => col(String(r.weight.tools))).join("")}`,
    `${"surface tokens".padEnd(width)}${results.map((r) => col(String(r.weight.tokens))).join("")}`,
    `${"avg prompt tokens".padEnd(width)}${results.map((r) => col(String(r.avgPromptTokens))).join("")}`,
    "",
  );

  const failures = results.flatMap((r) =>
    r.tasks.filter((t) => t.passes < t.runs).map((t) => `  ${r.surface} ${t.id}: ${t.attempts.find((a) => !a.ok)?.why}`),
  );
  if (failures.length) lines.push("failures:", ...failures, "");

  return lines.join("\n");
}
