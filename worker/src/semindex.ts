// The fleet's semindex corpora: scripts, workflows, tools. Registries call
// the upsert helpers on write; GET /find serves queries (scoped token —
// sandbox tools call it).

import { defineIndex } from "@workhorse/semindex";
import type { Env, ScriptRecord } from "@workhorse/api";


export const scriptIndex = defineIndex<ScriptRecord>({
  name: "scripts",
  id: (s) => `${s.scope}/${s.name}`,
  toText: (s) => `${s.name}: ${s.description}\n${s.command.slice(0, 500)}`,
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
  { name: "aft_search", description: "Indexed ranked code search across the repository", classification: "read-only" },
  { name: "aft_edit", description: "Symbol-aware structural code editing", classification: "write-capable" },
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
  { name: "run_script", description: "Run a registered script by name with args", classification: "write-capable" },
  { name: "write_script", description: "Register a persistent script for future runs (self-extension)", classification: "write-capable" },
  { name: "find_script", description: "Semantic search over registered scripts", classification: "read-only" },
  { name: "find_tool", description: "Semantic search over the sandbox tool catalog", classification: "read-only" },
  { name: "gh_pr", description: "Read a PR's live state: details, files, reviews, comments", classification: "read-only" },
  { name: "gh_ci", description: "Read GitHub Actions runs + failing jobs", classification: "read-only" },
  { name: "gh_issue", description: "Read a GitHub issue or its comments", classification: "read-only" },
  { name: "gh_search_code", description: "Search code across GitHub", classification: "read-only" },
  { name: "gh_commits", description: "List/read commits on GitHub", classification: "read-only" },
  { name: "workhorse_file_ticket", description: "File a new fleet ticket (repo + prompt)", classification: "write-capable" },
  { name: "workhorse_list_tickets", description: "Fleet ticket overview", classification: "read-only" },
  { name: "workhorse_ticket_status", description: "One ticket's record + live status", classification: "read-only" },
  { name: "workhorse_ticket_diff", description: "A finished ticket's patch", classification: "read-only" },
];

/** Rebuild every corpus (admin; idempotent — upserts replace by id). */
export async function reindexAll(env: Env): Promise<Record<string, number>> {
  const { listScripts } = await import("./db");
  // Scripts: all scopes — listScripts(repo) is scoped, so read the table.
  const { results } = await env.DB.prepare("SELECT * FROM scripts").all<Record<string, string>>();
  const scripts: ScriptRecord[] = (results ?? []).map((r) => ({
    scope: r.scope, name: r.name, description: r.description, command: r.command,
    args: JSON.parse(r.args || "[]"), statusGates: JSON.parse(r.status_gates || "[]"),
    createdBy: r.created_by as ScriptRecord["createdBy"], createdAt: r.created_at, updatedAt: r.updated_at,
  }));

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
