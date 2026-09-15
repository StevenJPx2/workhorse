// aft_inspect — codebase health snapshot (read-only).
//
// `inspect` refuses to run until `configure` has set the project root in the
// SAME process ("configure must run before aft_inspect so the harness-scoped
// cache path is known"). Since every exec is a fresh process, both requests go
// down one stdin stream via aftSequence.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aftSequence, type AftReply } from "./_shared";

/** Harness identity AFT scopes its cache by. */
const HARNESS = "runner";

export default tool({
  name: "aft_inspect",
  description:
    "Codebase health snapshot: diagnostics (compile/type errors), TODOs, dead code, unused " +
    "exports, duplicates, and file/symbol metrics. Run after a batch of edits and BEFORE tests " +
    "to catch type errors early.",
  docs: `
aft_inspect — codebase health snapshot. THE way to catch compile and type errors
before running tests.

ARGUMENTS
  scope  optional path to restrict the scan to

OUTPUT
  diagnostics     compile/type errors, warnings (per language server)
  metrics         files, symbols, lines of code
  todos           TODO/FIXME/HACK/BUG/XXX counts
  dead_code       unreferenced symbols
  unused_exports  exported but never imported
  duplicates      clone groups

WHEN TO RUN
  After a batch of edits and BEFORE tests or commit. Diagnostics surface
  compile errors far more cheaply than a failing test run.

EXAMPLES

  {}
  { scope: "src" }

NOTES
  Results can be INCOMPLETE on a first call: language servers and the call graph
  warm up asynchronously, and the output says so when a category is still
  pending. A "pending" diagnostics status is not the same as "no errors".
  Treat dead_code as a HINT — symbols reached only via dynamic dispatch are
  false positives.
`,
  input: v.object({ scope: v.optional(v.string()) }),
  async run({ input, sandbox }) {
    const replies = await aftSequence(sandbox, [
      // configure must precede inspect in the same process.
      { command: "configure", params: { harness: HARNESS, project_root: "/workspace" } },
      { command: "inspect", params: input.scope ? { path: input.scope } : {} },
    ]);

    if ("error" in replies) return `aft error: ${replies.error}`;

    const [configured, inspected] = replies;
    const rejected = firstFailure({ configure: configured, inspect: inspected });
    return rejected ?? renderSummary(inspected);
  },
});

/** The first failed step, as a readable message — or null when all succeeded. */
function firstFailure(steps: Record<string, AftReply | undefined>): string | null {
  for (const [name, reply] of Object.entries(steps)) {
    if (!reply) return `aft ${name}: no reply`;
    if (reply.success === false) return `aft ${name} failed (${reply.code ?? "unknown"}): ${reply.message ?? ""}`;
  }
  return null;
}

type Category = Record<string, unknown>;

/** A count, unless the category couldn't run — those must not read as zero. */
function countOrUnavailable(key: string, c: Category): string {
  // A false "0 dead code" is exactly the all-clear a cleanup pass would trust.
  return c.status === "unavailable" ? `${key}: unavailable (${c.reason ?? "not ready"})` : `${key}: ${c.count ?? 0}`;
}

/**
 * One renderer per category, so adding a category is a table entry rather than
 * another branch. Each returns null when its category is absent.
 */
const CATEGORIES: Array<(s: Record<string, Category>) => string | null> = [
  (s) => {
    const d = s.diagnostics;
    if (!d) return null;
    // "0 errors" while still analyzing is the most dangerous false all-clear,
    // because it arrives exactly when an agent wants to ship.
    const pending = d.status === "pending" ? " (still analyzing — not a clean bill of health)" : "";
    return `diagnostics: ${d.errors ?? 0} errors, ${d.warnings ?? 0} warnings${pending}`;
  },
  (s) => {
    const m = s.metrics;
    return m ? `metrics: ${m.files ?? 0} files, ${m.symbols ?? 0} symbols, ${m.loc ?? 0} loc` : null;
  },
  (s) => (s.todos ? `todos: ${s.todos.count ?? 0}` : null),
  (s) => (s.dead_code ? countOrUnavailable("dead_code", s.dead_code) : null),
  (s) => (s.unused_exports ? countOrUnavailable("unused_exports", s.unused_exports) : null),
  (s) => (s.duplicates ? countOrUnavailable("duplicates", s.duplicates) : null),
];

/** One line per category present in the summary. */
function summaryLines(summary: Record<string, Category>): string[] {
  return CATEGORIES.map((render) => render(summary)).filter((line): line is string => line !== null);
}

/** Render inspect's nested summary compactly, flagging incomplete categories. */
function renderSummary(reply: AftReply): string {
  const summary = reply.summary as Record<string, Category> | undefined;
  if (!summary) return JSON.stringify(reply, null, 1).slice(0, 20_000);

  const lines = summaryLines(summary);
  if (reply.complete === false) lines.push("\n(incomplete — re-run for warmed-up results)");

  return lines.join("\n") || "(no output)";
}
