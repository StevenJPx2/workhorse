// AI Search-backed corpora for the light registries (M1: semindex → AI
// Search migration). Three corpora — scripts, workflows, tools — in ONE
// hybrid instance ("workhorse-registries"), scoped per corpus by the
// metadata `kind` filter on query. Scripts are dual-written on registration;
// workflows/tools are rebuilt via /admin/reindex-registries (they are static
// definitions, not user data).
//
// The read path mirrors plugins/knowledge/query.ts — same instance API, same
// flatten, same never-throws contract — kept here because packages/server
// cannot import from a plugin package (hard boundary, see worker/registry.ts).

import { db } from "@workhorse/db";
import type { Env, ScriptRecord } from "@workhorse/api";
import type { WorkflowCatalog } from "./router";

/** AI Search instance ids — ONE per corpus, so no metadata filter is needed
 * (the Vectorize filter grammar is honored inconsistently across retrieval
 * modes — keyword retrieval ignores it — and a leaked cross-corpus hit is
 * worse than no hit). */
const INSTANCES: Record<RegistryCorpus, string> = {
  scripts: "workhorse-scripts",
  workflows: "workhorse-workflows",
  tools: "workhorse-tools",
};

/** Corpus ids. */
export type RegistryCorpus = "scripts" | "workflows" | "tools";

// The get-or-create + never-throws shape intentionally mirrors
// plugins/knowledge/query.ts — the two packages cannot share code (plugins
// depend only on @workhorse/api), so the pattern is duplicated by design.
/** Get the corpus instance, creating it on first use (hybrid retrieval). */
export async function registriesInstance(env: Env, kind: RegistryCorpus): Promise<AiSearchInstance | null> {
  if (!env.AI_SEARCH) return null;
  const inst = env.AI_SEARCH.get(INSTANCES[kind]);
  try {
    await inst.info();
    return inst;
  } catch {
    try {
      return await env.AI_SEARCH.create({
        id: INSTANCES[kind],
        // Hybrid: verbatim identifiers (tool names, script names) need
        // keyword hits; intent queries need vectors.
        index_method: { vector: true, keyword: true },
      });
    } catch (err) {
      console.warn(`registries instance create failed (${kind}):`, err);
      return null;
    }
  }
}

/** Filename for a corpus document — collision replaces (upsert). */
function docName(kind: RegistryCorpus, id: string): string {
  return `${kind}/${id}.md`;
}

// ---- scripts corpus -------------------------------------------------------

/** Render a script as the document AI Search indexes (mirrors semindex toText). */
function renderScriptDoc(script: ScriptRecord): string {
  return [
    `# ${script.name}`,
    "",
    `- scope: ${script.scope}`,
    `- name: ${script.name}`,
    "",
    script.description,
    "",
    "```",
    script.code.slice(0, 1000),
    "```",
  ].join("\n");
}

/** Index (or replace) one script. Never throws — indexing must not undo a save. */
export async function upsertScriptDoc(env: Env, script: ScriptRecord): Promise<boolean> {
  const inst = await registriesInstance(env, "scripts");
  if (!inst) return false;
  // uploadAndPoll: a fresh instance indexes asynchronously, and a script
  // saved moments ago must be findable — the poll waits for processing
  // instead of returning before the item is searchable.
  return upsertScriptDocInto(inst, script, true);
}

/** Upload one script into an already-resolved instance (reindex reuses it).
 * poll=true (the save path) waits for processing so a just-saved script is
 * findable; poll=false (reindex) is fire-and-forget — uploadAndPoll fails on
 * re-upload of an existing item, which made reindex report 0 for a populated
 * corpus. */
async function upsertScriptDocInto(inst: AiSearchInstance, script: ScriptRecord, poll: boolean): Promise<boolean> {
  try {
    const upload = poll ? inst.items.uploadAndPoll.bind(inst.items) : inst.items.upload.bind(inst.items);
    await upload(docName("scripts", `${script.scope}/${script.name}`), renderScriptDoc(script), {
      metadata: {
        kind: "scripts",
        scope: script.scope,
        name: script.name,
        description: script.description.slice(0, 200),
      },
    });
    return true;
  } catch (err) {
    console.warn(`script index failed for ${script.scope}/${script.name}:`, err);
    return false;
  }
}

// ---- workflows + tools corpora (static definitions) -----------------------

/** The sandbox tool catalog — what an agent CAN be given (stage allowlists
 * decide what it IS given). Descriptions mirror the extension docstrings;
 * update alongside new plugins. */
export interface ToolDoc {
  name: string;
  description: string;
  classification: "read-only" | "write-capable";
}

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
  { name: "memory_search", description: "Search this repo's accumulated agent memory (AI Search, per-repo namespace)", classification: "read-only" },
  { name: "memory_write", description: "Write durable repo memory for future runs", classification: "write-capable" },
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

/** Rebuild the workflows corpus from the composition root's catalog. */
async function upsertWorkflows(env: Env, catalog: WorkflowCatalog): Promise<number> {
  const entries = await catalog.list();
  const inst = await registriesInstance(env, "workflows");
  if (!inst) return 0;
  // Plain upload (no poll): the reindex route must return fast; a 45-item
  // sequential uploadAndPoll takes minutes. Items settle asynchronously.
  const results = await Promise.allSettled(
    entries.map((w) =>
      inst.items.upload(
        docName("workflows", w.name),
        `# ${w.name}\n\n${w.description ?? ""}\n\nstages: ${w.stages.join(" → ")}`,
        {
          metadata: {
            kind: "workflows",
            name: w.name,
            description: (w.description ?? "").slice(0, 200),
            stages: w.stages.join(" → "),
          },
        },
      ),
    ),
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

/** Rebuild the tools corpus from TOOL_CATALOG. */
async function upsertTools(env: Env): Promise<number> {
  const inst = await registriesInstance(env, "tools");
  if (!inst) return 0;
  const results = await Promise.allSettled(
    TOOL_CATALOG.map((t) =>
      inst.items.upload(
        docName("tools", t.name),
        `# ${t.name}\n\n${t.description}\n\nclassification: ${t.classification}`,
        {
          metadata: { kind: "tools", name: t.name, description: t.description.slice(0, 200), classification: t.classification },
        },
      ),
    ),
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

/** Rebuild every corpus from its source of truth (admin route). */
export async function reindexAll(env: Env, workflows?: WorkflowCatalog): Promise<Record<string, number>> {
  const scripts = await db(env).scripts.all();
  // Resolve the instance ONCE: a fresh instance races parallel creates (only
  // one wins, the rest report failure) — a cold reindex would silently omit
  // most scripts.
  const inst = await registriesInstance(env, "scripts");
  const scriptResults = await Promise.allSettled(scripts.map((s) => (inst ? upsertScriptDocInto(inst, s, false) : Promise.resolve(false))));
  return {
    scripts: scriptResults.filter((r) => r.status === "fulfilled" && r.value).length,
    workflows: workflows ? await upsertWorkflows(env, workflows) : 0,
    tools: await upsertTools(env),
  };
}

// ---- read path ------------------------------------------------------------

export interface RegistryHit {
  /** Stable id, matching the semindex SemHit contract (scope/name etc.). */
  id: string;
  score?: number;
  metadata: Record<string, unknown>;
}

/**
 * Query one corpus. Never throws: an unreachable index is "no hits".
 * Results keep the semindex SemHit shape ({ id, score, metadata }) so the
 * /find API contract is identical across corpora. The corpus instance IS the
 * scope — no metadata filter (see INSTANCES).
 */
export async function queryRegistry(env: Env, kind: RegistryCorpus, q: string, limit = 5): Promise<RegistryHit[]> {
  try {
    const inst = await registriesInstance(env, kind);
    if (!inst) return [];

    const res = await inst.search({
      query: q,
      ai_search_options: {
        retrieval: {
          max_num_results: Math.min(Math.max(limit, 1), 20),
        },
      },
    } as never);

    const chunks = (res as { chunks?: Array<Record<string, unknown>> }).chunks ?? [];
    return chunks.map((chunk) => {
      const item = (chunk.item as { key?: string; metadata?: Record<string, unknown> } | undefined) ?? {};
      const a = item.metadata ?? {};
      const name = String(a.name ?? item.key ?? "unknown");
      const scope = String(a.scope ?? "global");
      return {
        id: kind === "scripts" ? `${scope}/${name}` : name,
        score: typeof chunk.score === "number" ? chunk.score : undefined,
        metadata: { ...a, name, scope },
      };
    });
  } catch (err) {
    console.warn(`AI Search registries query failed (${kind}:${q.slice(0, 60)}):`, err);
    return [];
  }
}
