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
    if (configured?.success === false) {
      return `aft configure failed (${configured.code ?? "unknown"}): ${configured.message ?? ""}`;
    }
    if (!inspected) return "aft inspect: no reply";
    if (inspected.success === false) {
      return `aft inspect failed (${inspected.code ?? "unknown"}): ${inspected.message ?? ""}`;
    }

    return renderSummary(inspected);
  },
});

/** Render inspect's nested summary compactly, flagging incomplete categories. */
function renderSummary(reply: AftReply): string {
  const summary = reply.summary as Record<string, Record<string, unknown>> | undefined;
  if (!summary) return JSON.stringify(reply, null, 1).slice(0, 20_000);

  const lines: string[] = [];
  const d = summary.diagnostics;
  if (d) {
    const status = d.status === "pending" ? " (still analyzing — not a clean bill of health)" : "";
    lines.push(`diagnostics: ${d.errors ?? 0} errors, ${d.warnings ?? 0} warnings${status}`);
  }

  const m = summary.metrics;
  if (m) lines.push(`metrics: ${m.files ?? 0} files, ${m.symbols ?? 0} symbols, ${m.loc ?? 0} loc`);

  const t = summary.todos;
  if (t) lines.push(`todos: ${t.count ?? 0}`);

  for (const key of ["dead_code", "unused_exports", "duplicates"] as const) {
    const c = summary[key];
    if (!c) continue;
    // An unavailable category must not read as zero — that would be a false
    // all-clear on exactly the checks a cleanup pass relies on.
    lines.push(
      c.status === "unavailable"
        ? `${key}: unavailable (${c.reason ?? "not ready"})`
        : `${key}: ${c.count ?? 0}`,
    );
  }

  if (reply.complete === false) lines.push("\n(incomplete — re-run for warmed-up results)");

  return lines.join("\n") || "(no output)";
}
