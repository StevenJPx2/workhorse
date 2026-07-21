// D1: the relational plane. Tickets, escalations, trace index, scripts —
// records with relationships, queried like records. KV keeps hot small
// state (live:, cursors, thread mappings, auth token) and — until R2 —
// blobs (trace bodies, MC dbs, diffs).

import type { Env, TicketRecord } from "@workhorse/api";

// --- row ⇄ record mapping -------------------------------------------------

interface TicketRow {
  id: string;
  title: string;
  repo: string;
  prompt: string;
  status: string;
  created_at: string;
  updated_at: string;
  plan: string | null;
  result: string | null;
  error: string | null;
  branch: string | null;
  pr_url: string | null;
  run_id: string | null;
  workflow: string | null;
  wf_instance: string | null;
  heal_attempts: number;
}

function toRecord(r: TicketRow): TicketRecord {
  return {
    id: r.id,
    title: r.title,
    repo: r.repo,
    prompt: r.prompt,
    status: r.status as TicketRecord["status"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    plan: r.plan ?? undefined,
    result: r.result ?? undefined,
    error: r.error ?? undefined,
    branch: r.branch ?? undefined,
    prUrl: r.pr_url ?? undefined,
    runId: r.run_id ?? undefined,
    workflow: r.workflow ?? undefined,
    wfInstance: r.wf_instance ?? undefined,
    healAttempts: r.heal_attempts || undefined,
  };
}

// --- tickets ---------------------------------------------------------------

export async function getTicket(env: Env, id: string): Promise<TicketRecord | null> {
  const row = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(id).first<TicketRow>();
  return row ? toRecord(row) : null;
}

export async function insertTicket(env: Env, rec: TicketRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO tickets
     (id, title, repo, prompt, status, created_at, updated_at, plan, result, error,
      branch, pr_url, run_id, workflow, wf_instance, heal_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      rec.id,
      rec.title,
      rec.repo,
      rec.prompt,
      rec.status,
      rec.createdAt,
      rec.updatedAt,
      rec.plan ?? null,
      rec.result ?? null,
      rec.error ?? null,
      rec.branch ?? null,
      rec.prUrl ?? null,
      rec.runId ?? null,
      rec.workflow ?? null,
      rec.wfInstance ?? null,
      rec.healAttempts ?? 0,
    )
    .run();
}

/** Patch a ticket; returns the previous record (for transition hooks) or null. */
export async function patchTicket(
  env: Env,
  id: string,
  patch: Partial<TicketRecord>,
): Promise<{ prev: TicketRecord; next: TicketRecord } | null> {
  const prev = await getTicket(env, id);
  if (!prev) return null;
  const next: TicketRecord = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await insertTicket(env, next);
  return { prev, next };
}

export async function listTickets(env: Env, status?: string): Promise<TicketRecord[]> {
  const stmt = status
    ? env.DB.prepare("SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC").bind(status)
    : env.DB.prepare("SELECT * FROM tickets ORDER BY created_at DESC");
  const { results } = await stmt.all<TicketRow>();
  return (results ?? []).map(toRecord);
}

/** Repos seen in the fleet, most recently used first (home-page chips). */
export async function knownRepos(env: Env, limit = 20): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT repo, MAX(updated_at) AS last FROM tickets GROUP BY repo ORDER BY last DESC LIMIT ?",
  )
    .bind(limit)
    .all<{ repo: string }>();
  return (results ?? []).map((r) => r.repo);
}

// --- escalations -----------------------------------------------------------

export async function insertEscalation(
  env: Env,
  e: {
    ticketId: string;
    runId: string;
    trigger: string;
    detail: string;
    stage?: string;
    toModel?: string;
    at: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO escalations (ticket_id, run_id, trigger_kind, detail, stage, to_model, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(e.ticketId, e.runId, e.trigger, e.detail, e.stage ?? null, e.toModel ?? null, e.at)
    .run();
}

// --- trace index -----------------------------------------------------------

export async function insertTraceIndex(
  env: Env,
  t: { ticketId: string; runId: string; kind: string; archivedAt: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO traces (ticket_id, run_id, kind, archived_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(t.ticketId, t.runId, t.kind, t.archivedAt)
    .run();
}

export async function listTraceIndex(
  env: Env,
  ticketId: string,
): Promise<Array<{ runId: string; kind: string; archivedAt: string }>> {
  const { results } = await env.DB.prepare(
    "SELECT run_id, kind, archived_at FROM traces WHERE ticket_id = ? ORDER BY archived_at",
  )
    .bind(ticketId)
    .all<{ run_id: string; kind: string; archived_at: string }>();
  return (results ?? []).map((r) => ({ runId: r.run_id, kind: r.kind, archivedAt: r.archived_at }));
}

// --- scripts (agent self-extension) -----------------------------------------

export interface ScriptRecord {
  /** "global" or "repo:<owner/repo>". */
  scope: string;
  name: string;
  description: string;
  /** Shell command body (bash -c). Args arrive as $ARG_<NAME> env vars. */
  command: string;
  /** Declared args: [{name, description, required}] */
  args: Array<{ name: string; description?: string; required?: boolean }>;
  /** Ticket statuses allowed to run this script; empty = any. */
  statusGates: string[];
  createdBy: "agent" | "user" | "seed";
  createdAt: string;
  updatedAt: string;
}

interface ScriptRow {
  scope: string;
  name: string;
  description: string;
  command: string;
  args: string;
  status_gates: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toScript(r: ScriptRow): ScriptRecord {
  return {
    scope: r.scope,
    name: r.name,
    description: r.description,
    command: r.command,
    args: JSON.parse(r.args || "[]"),
    statusGates: JSON.parse(r.status_gates || "[]"),
    createdBy: r.created_by as ScriptRecord["createdBy"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SCRIPT_NAME_RE = /^[a-z][a-z0-9_-]{1,63}$/;
const VALID_GATES = new Set([
  "queued",
  "planning",
  "implementing",
  "ready-for-review",
  "in-review",
]);

/** Validate a script registration; returns an error string or null. */
export function validateScript(s: {
  name?: string;
  command?: string;
  scope?: string;
  args?: unknown;
  statusGates?: unknown;
}): string | null {
  if (!s.name || !SCRIPT_NAME_RE.test(s.name)) {
    return "name must match ^[a-z][a-z0-9_-]{1,63}$";
  }
  if (!s.command?.trim()) return "command required";
  if (s.command.length > 16384) return "command too long (16 KiB max)";
  if (!s.scope || (s.scope !== "global" && !s.scope.startsWith("repo:"))) {
    return 'scope must be "global" or "repo:<owner/repo>"';
  }
  if (s.args !== undefined) {
    if (!Array.isArray(s.args)) return "args must be an array";
    for (const a of s.args as Array<{ name?: string }>) {
      if (!a?.name || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(a.name)) {
        return "each arg needs a name matching ^[A-Za-z][A-Za-z0-9_]{0,31}$";
      }
    }
  }
  if (s.statusGates !== undefined) {
    if (!Array.isArray(s.statusGates)) return "statusGates must be an array";
    for (const g of s.statusGates as string[]) {
      if (!VALID_GATES.has(g)) return `unknown status gate "${g}"`;
    }
  }
  return null;
}

export async function upsertScript(env: Env, s: ScriptRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO scripts (scope, name, description, command, args, status_gates, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope, name) DO UPDATE SET
       description = excluded.description,
       command = excluded.command,
       args = excluded.args,
       status_gates = excluded.status_gates,
       updated_at = excluded.updated_at`,
  )
    .bind(
      s.scope,
      s.name,
      s.description,
      s.command,
      JSON.stringify(s.args),
      JSON.stringify(s.statusGates),
      s.createdBy,
      s.createdAt,
      s.updatedAt,
    )
    .run();
}

export async function getScript(env: Env, scope: string, name: string): Promise<ScriptRecord | null> {
  const row = await env.DB.prepare("SELECT * FROM scripts WHERE scope = ? AND name = ?")
    .bind(scope, name)
    .first<ScriptRow>();
  return row ? toScript(row) : null;
}

/** Scripts visible to a repo: its own scope + global, repo-scoped winning name clashes. */
export async function listScripts(env: Env, repo?: string): Promise<ScriptRecord[]> {
  const scopes = repo ? [`repo:${repo}`, "global"] : ["global"];
  const { results } = await env.DB.prepare(
    `SELECT * FROM scripts WHERE scope IN (${scopes.map(() => "?").join(",")}) ORDER BY name, scope DESC`,
  )
    .bind(...scopes)
    .all<ScriptRow>();
  const seen = new Set<string>();
  const out: ScriptRecord[] = [];
  for (const row of results ?? []) {
    // repo:* sorts before "global" per ORDER BY scope DESC — first wins.
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    out.push(toScript(row));
  }
  return out;
}

export async function deleteScript(env: Env, scope: string, name: string): Promise<boolean> {
  const r = await env.DB.prepare("DELETE FROM scripts WHERE scope = ? AND name = ?")
    .bind(scope, name)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// --- one-time backfill from KV ----------------------------------------------

/** Import legacy KV records into D1. Idempotent (INSERT OR REPLACE / IGNORE). */
export async function backfillFromKV(
  env: Env,
): Promise<{ tickets: number; escalations: number; traces: number }> {
  let tickets = 0;
  let escalations = 0;
  let traces = 0;
  let cursor: string | undefined;
  do {
    const page = await env.TICKETS.list({ cursor });
    for (const key of page.keys) {
      const name = key.name;
      try {
        if (!name.includes(":")) {
          // Plain id = ticket record.
          const raw = await env.TICKETS.get(name);
          if (!raw) continue;
          const rec = JSON.parse(raw) as TicketRecord;
          if (!rec.id || !rec.status || !rec.createdAt) continue;
          await insertTicket(env, rec);
          tickets++;
        } else if (name.startsWith("esc:")) {
          const [, ticketId, runId] = name.split(":");
          const raw = await env.TICKETS.get(name);
          if (!raw || !ticketId || !runId) continue;
          for (const e of JSON.parse(raw) as Array<Record<string, string>>) {
            await insertEscalation(env, {
              ticketId,
              runId,
              trigger: e.trigger ?? "unknown",
              detail: e.detail ?? "",
              stage: e.stage,
              toModel: e.toModel,
              at: e.at ?? new Date().toISOString(),
            });
            escalations++;
          }
        } else if (name.startsWith("traces:")) {
          const ticketId = name.slice("traces:".length);
          const raw = await env.TICKETS.get(name);
          if (!raw) continue;
          for (const t of JSON.parse(raw) as Array<Record<string, string>>) {
            if (!t.runId) continue;
            await insertTraceIndex(env, {
              ticketId,
              runId: t.runId,
              kind: t.kind ?? "unknown",
              archivedAt: t.archivedAt ?? new Date().toISOString(),
            });
            traces++;
          }
        }
      } catch (err) {
        console.warn(`backfill skipped ${name}:`, err);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { tickets, escalations, traces };
}
