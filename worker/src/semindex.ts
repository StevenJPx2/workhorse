// The fleet's semindex corpora: scripts, workflows, tools. Registries call
// the upsert helpers on write; GET /find serves queries (scoped token —
// sandbox tools call it).

import { defineIndex } from "@workhorse/semindex";
import { db } from "./db";
import type { Env, ScriptRecord } from "@workhorse/api";


export const scriptIndex = defineIndex<ScriptRecord>({
  name: "scripts",
  id: (s) => `${s.scope}/${s.name}`,
  toText: (s) => `${s.name}: ${s.description}\n${s.code.slice(0, 500)}`,
  metadata: (s) => ({ name: s.name, scope: s.scope, description: s.description.slice(0, 200) }),
});

export const workflowIndex = defineIndex<{ name: string; description?: string; stages: string[] }>({
  name: "workflows",
  id: (w) => w.name,
  toText: (w) => `${w.name}: ${w.description ?? ""} (stages: ${w.stages.join(" → ")})`,
  metadata: (w) => ({ name: w.name, description: (w.description ?? "").slice(0, 200), stages: w.stages.join(" → ") }),
});

export interface ToolDoc {
  name: string;
  description: string;
  classification: "read-only" | "write-capable";
}

export const toolIndex = defineIndex<ToolDoc>({
  name: "tools",
  id: (t) => t.name,
  toText: (t) => `${t.name}: ${t.description}`,
  metadata: (t) => ({ name: t.name, description: t.description.slice(0, 300), classification: t.classification }),
});

/**
 * The sandbox tool catalog — what an agent CAN be given (stage allowlists
 * decide what it IS given). Descriptions mirror the extension docstrings;
 * update alongside new plugins.
 */
export const TOOL_CATALOG: ToolDoc[] = [
  { name: "read", description: "Read a file from the repository", classification: "read-only" },
  { name: "write", description: "Write/create a file in the repository", classification: "write-capable" },
  { name: "edit", description: "Edit a file by find/replace", classification: "write-capable" },
  { name: "grep", description: "Search file contents by regex", classification: "read-only" },
  { name: "find", description: "Find files by glob pattern", classification: "read-only" },
  { name: "bash", description: "Run a shell command in the workspace", classification: "write-capable" },
  { name: "aft_outline", description: "Structural outline of source files: symbols, functions, classes with line ranges", classification: "read-only" },
  { name: "aft_zoom", description: "Read a specific symbol/function's full source", classification: "read-only" },
  { name: "aft_search", description: "Indexed regex code search across the repository, ranked and path-scopable", classification: "read-only" },
  { name: "aft_inspect", description: "Codebase health: compile/type diagnostics, TODOs, dead code, unused exports, duplicates", classification: "read-only" },
  { name: "ctx_search", description: "Search this repo's accumulated agent memory (Magic Context)", classification: "read-only" },
  { name: "ctx_memory", description: "Write durable repo memory for future runs", classification: "write-capable" },
  { name: "search_fleet_knowledge", description: "Search distilled traces of every past fleet run — institutional memory across repos", classification: "read-only" },
  { name: "browser_fetch", description: "Fetch a live web page (markdown) via the browser plane", classification: "read-only" },
  { name: "browser_open", description: "Open/navigate to a URL in the persistent browser session (starts daemon on first call)", classification: "read-only" },
  { name: "browser_snapshot", description: "Accessibility tree with element refs (@e1, @e2, …) — token-cheap page inspection for agent-browser actions", classification: "read-only" },
  { name: "browser_read", description: "Read the current page's rendered content as text/markdown (JS-executed, live DOM); for static pages prefer web_read (Jina)", classification: "read-only" },
  { name: "browser_act", description: "Perform an action on a page element by ref from browser_snapshot: click, fill, type, press, hover, scroll, select, check", classification: "write-capable" },
  { name: "browser_screenshot", description: "PNG screenshot of the current browser page (call browser_open first)", classification: "read-only" },
  { name: "browser_record", description: "Record a short page interaction (scroll, animation, click flow) as an animated GIF via timed frame capture + ffmpeg; pair with upload_image to embed demos in PRs", classification: "read-only" },
  { name: "upload_image", description: "Host a local image publicly, returns URL (for PR descriptions)", classification: "read-only" },
  { name: "upload_text", description: "Host text/code publicly, returns raw curl-able URL (logs, patches, repro scripts)", classification: "read-only" },
  { name: "list_scripts", description: "List this repo's registered scripts — the fleet's self-built toolbox", classification: "read-only" },
  { name: "run_script", description: "Run a registered script by name with args — a saved Code Mode TS program that chains this stage's tools in one sandboxed run", classification: "write-capable" },
  { name: "write_script", description: "Save a Code Mode TS program (chaining this stage's tools) as a persistent named script for future runs — self-extension", classification: "write-capable" },
  { name: "find_script", description: "Semantic search over registered scripts", classification: "read-only" },
  { name: "find_tool", description: "Semantic search over the sandbox tool catalog", classification: "read-only" },
  { name: "run_code", description: "Code Mode: run a TS/JS program that chains this stage's tools (tools.<name>(input)) in one sandboxed dynamic-worker run — batch reads/greps/commands without a model round-trip per call", classification: "write-capable" },
  { name: "gh_pr", description: "Read a PR's live state: details, files, reviews, comments", classification: "read-only" },
  { name: "gh_ci", description: "Read GitHub Actions runs + failing jobs", classification: "read-only" },
  { name: "gh_issue", description: "Read a GitHub issue or its comments", classification: "read-only" },
  { name: "gh_search_code", description: "Search code across GitHub", classification: "read-only" },
  { name: "gh_commits", description: "List/read commits on GitHub", classification: "read-only" },
  { name: "workhorse_file_ticket", description: "File a new fleet ticket (repo + prompt)", classification: "write-capable" },
  { name: "workhorse_list_tickets", description: "Fleet ticket overview", classification: "read-only" },
  { name: "workhorse_ticket_status", description: "One ticket's record + live status", classification: "read-only" },
  { name: "workhorse_ticket_diff", description: "A finished ticket's patch", classification: "read-only" },
  { name: "todo_write", description: "Create the run's ordered todo list (+ subtasks) — decompose work into units a coder does one at a time", classification: "write-capable" },
  { name: "todo_read", description: "Read the run's todo list with current status and subtasks", classification: "read-only" },
  { name: "todo_update", description: "Update one todo's status (in_progress/done) or tick a subtask — marking done advances the workflow", classification: "write-capable" },
];

/** Rebuild every corpus (admin; idempotent — upserts replace by id). */
export async function reindexAll(env: Env): Promise<Record<string, number>> {
  // Every scope — listScripts(repo) is deliberately scoped, so the index build
  // reads the whole table. The rows already carry parsed args/statusGates, so
  // the hand-rolled JSON.parse mapping this replaced is gone.
  const scripts = await db(env).allScripts();

  // Workflows are hard-coded defs — index their manifests directly.
  const { workflowDefs } = await import("@workhorse/workflow");
  const workflows = Object.values(workflowDefs).map((d) => ({
    name: d.name,
    description: d.description,
    stages: d.stages.map((s) => s.id),
  }));

  return {
    scripts: await scriptIndex.upsert(env, scripts),
    workflows: await workflowIndex.upsert(env, workflows),
    tools: await toolIndex.upsert(env, TOOL_CATALOG),
  };
}
