// Stage tools: AFT — bashless code intelligence (flue engine).
//
// The port that proves the sandbox-engine pattern (user-pinned: "AFT has
// to port"). The `aft` CLI is baked into the sandbox image; each tool's
// run() execs `aft <cmd> --json <args>` in the container through the
// sandbox handle and returns the CLI's output. The tool DEFINITION lives
// worker-side (agent loop runs in the Worker); the ENGINE runs sandbox-side
// — the same split as agent-browser and the script service.
//
// Read tools (outline/zoom/search/inspect) are classified read-only; edit
// is write-capable and rides the stage's writeAllow gate.

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory, SandboxHandle } from "@workhorse/api";
import * as v from "valibot";

/** Run the aft CLI in the workspace; shell-quote args, return stdout (or stderr on failure). */
async function aft(sandbox: SandboxHandle, args: string[]): Promise<string> {
  const quoted = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  const r = await sandbox.exec(`aft ${quoted}`, { timeout: 60_000 });
  if (r.exitCode !== 0) return `aft error (exit ${r.exitCode}): ${r.stderr.slice(-2000) || r.stdout.slice(-2000)}`;
  return r.stdout || "(no output)";
}

export const aftTools: PluginToolFactory = ({ sandbox }) => [
  defineTool({
    name: "aft_outline",
    description:
      "Structural outline of a file or directory: symbols (functions, classes, types) with " +
      "line ranges, or a Markdown/HTML heading tree. Explore structure before reading with aft_zoom.",
    input: v.object({ target: v.string(), files: v.optional(v.boolean()) }),
    run: ({ input }) =>
      aft(sandbox, ["outline", "--json", ...(input.files ? ["--files"] : []), input.target]),
  }),
  defineTool({
    name: "aft_zoom",
    description:
      "Read the full source of a named symbol (function/class/type) in a file, or a section " +
      "under a Markdown/HTML heading. Precise symbol-level reading without dumping the whole file.",
    input: v.object({ filePath: v.string(), symbol: v.string(), contextLines: v.optional(v.number()) }),
    run: ({ input }) =>
      aft(sandbox, [
        "zoom",
        "--json",
        "--file",
        input.filePath,
        "--symbol",
        input.symbol,
        ...(input.contextLines ? ["--context", String(input.contextLines)] : []),
      ]),
  }),
  defineTool({
    name: "aft_search",
    description:
      "AST-aware structural code search across the workspace. Pattern is a code fragment with " +
      "meta-variables ($VAR one node, $$$ many). Language-aware; far more precise than grep.",
    input: v.object({ pattern: v.string(), lang: v.string(), paths: v.optional(v.array(v.string())) }),
    run: ({ input }) =>
      aft(sandbox, ["search", "--json", "--lang", input.lang, "--pattern", input.pattern, ...(input.paths ?? [])]),
  }),
  defineTool({
    name: "aft_inspect",
    description:
      "Codebase health snapshot: diagnostics (compile/type errors), TODOs, dead code, unused " +
      "exports, duplicates. Run after edits and before tests/commit to catch errors early.",
    input: v.object({ scope: v.optional(v.string()), sections: v.optional(v.array(v.string())) }),
    run: ({ input }) =>
      aft(sandbox, [
        "inspect",
        "--json",
        ...(input.scope ? ["--scope", input.scope] : []),
        ...(input.sections?.length ? ["--sections", input.sections.join(",")] : []),
      ]),
  }),
  defineTool({
    name: "aft_edit",
    description:
      "Structural edit of a file: find/replace, line-range replace, or whole-symbol replace. " +
      "Tree-sitter validated; backs up before writing. Subject to the stage's writeAllow gate.",
    input: v.object({
      filePath: v.string(),
      oldString: v.optional(v.string()),
      newString: v.optional(v.string()),
      symbol: v.optional(v.string()),
      content: v.optional(v.string()),
      replaceAll: v.optional(v.boolean()),
    }),
    run: ({ input }) =>
      aft(sandbox, [
        "edit",
        "--json",
        "--file",
        input.filePath,
        ...(input.symbol ? ["--symbol", input.symbol] : []),
        ...(input.oldString != null ? ["--old", input.oldString] : []),
        ...(input.newString != null ? ["--new", input.newString] : []),
        ...(input.content != null ? ["--content", input.content] : []),
        ...(input.replaceAll ? ["--replace-all"] : []),
      ]),
  }),
];
