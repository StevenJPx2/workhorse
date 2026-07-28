// The relational plane, as one injected object.
//
// Constructed ONCE per request/run and passed down, rather than every function
// taking `env` and re-deriving a connection. `drizzle(env.DB)` is cheap but not
// free, and threading `env` purely to reach the database made every caller
// depend on the whole environment to do one query.

import type { Env, TicketRecord } from "@workhorse/api";
import { and, desc, eq, inArray, isNull, lte, max, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  escalations,
  type NewEscalation,
  type Notification,
  notifications,
  type Script,
  type ScriptArg,
  scripts,
  type Ticket,
  type TicketStatus,
  tickets,
  traces,
} from "./schema";

/**
 * Adapt a row to the API's `TicketRecord`, which uses `undefined` for absent
 * values where SQL uses `null`.
 *
 * This is the ONLY mapping left, and unlike the hand-written row interface it
 * replaces, its input type is inferred from the schema — so adding a column or
 * changing one's type surfaces as a type error here rather than a silently
 * dropped field.
 */
export function toTicketRecord(r: Ticket): TicketRecord {
  return {
    id: r.id,
    title: r.title,
    repo: r.repo,
    prompt: r.prompt,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    plan: r.plan ?? undefined,
    result: r.result ?? undefined,
    error: r.error ?? undefined,
    branch: r.branch ?? undefined,
    prUrl: r.prUrl ?? undefined,
    runId: r.runId ?? undefined,
    workflow: r.workflow ?? undefined,
    wfInstance: r.wfInstance ?? undefined,
    // 0 means "never healed", which the API represents as absent.
    healAttempts: r.healAttempts || undefined,
  };
}

/** The inverse: an API record as an insertable row. */
function toTicketRow(rec: TicketRecord): Ticket {
  return {
    id: rec.id,
    title: rec.title,
    repo: rec.repo,
    prompt: rec.prompt,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    plan: rec.plan ?? null,
    result: rec.result ?? null,
    error: rec.error ?? null,
    branch: rec.branch ?? null,
    prUrl: rec.prUrl ?? null,
    runId: rec.runId ?? null,
    workflow: rec.workflow ?? null,
    wfInstance: rec.wfInstance ?? null,
    healAttempts: rec.healAttempts ?? 0,
  };
}

export interface TraceIndexEntry {
  runId: string;
  kind: string;
  archivedAt: string;
}

export interface EscalationEntry {
  trigger: string;
  detail: string;
  stage?: string;
  toModel?: string;
  at: string;
}

export class Db {
  private readonly d: DrizzleD1Database;

  constructor(binding: D1Database) {
    this.d = drizzle(binding);
  }

  /** Convenience for the common `new Db(env.DB)`. */
  static from(env: Pick<Env, "DB">): Db {
    return new Db(env.DB);
  }

  // --- tickets -------------------------------------------------------------

  async getTicket(id: string): Promise<TicketRecord | null> {
    const [row] = await this.d.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    return row ? toTicketRecord(row) : null;
  }

  /** Insert or fully replace a ticket. */
  async putTicket(rec: TicketRecord): Promise<void> {
    const row = toTicketRow(rec);
    await this.d
      .insert(tickets)
      .values(row)
      // The old layer used INSERT OR REPLACE, which DELETEs then INSERTs —
      // firing delete triggers and losing any column not in the statement.
      // An explicit upsert updates in place.
      .onConflictDoUpdate({ target: tickets.id, set: row });
  }

  /** Patch a ticket; returns prev+next so transition hooks can diff them. */
  async patchTicket(
    id: string,
    patch: Partial<TicketRecord>,
  ): Promise<{ prev: TicketRecord; next: TicketRecord } | null> {
    const prev = await this.getTicket(id);
    if (!prev) return null;

    const next: TicketRecord = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    await this.putTicket(next);
    return { prev, next };
  }

  async listTickets(status?: string): Promise<TicketRecord[]> {
    const q = this.d.select().from(tickets).orderBy(desc(tickets.createdAt));
    const rows = await (status ? q.where(eq(tickets.status, status as TicketStatus)) : q);
    return rows.map(toTicketRecord);
  }

  /** Repos seen in the fleet, most recently used first (home-page chips). */
  async knownRepos(limit = 20): Promise<string[]> {
    const rows = await this.d
      .select({ repo: tickets.repo, last: max(tickets.updatedAt) })
      .from(tickets)
      .groupBy(tickets.repo)
      .orderBy(desc(max(tickets.updatedAt)))
      .limit(limit);
    return rows.map((r) => r.repo);
  }

  // --- escalations ---------------------------------------------------------

  async insertEscalation(e: NewEscalation): Promise<void> {
    await this.d.insert(escalations).values(e);
  }

  /** Every escalation for one run, chronological — the trace's model history. */
  async runEscalations(ticketId: string, runId: string): Promise<EscalationEntry[]> {
    const rows = await this.d
      .select()
      .from(escalations)
      .where(and(eq(escalations.ticketId, ticketId), eq(escalations.runId, runId)))
      .orderBy(escalations.at);
    return rows.map((r) => ({
      trigger: r.trigger,
      detail: r.detail,
      stage: r.stage ?? undefined,
      toModel: r.toModel ?? undefined,
      at: r.at,
    }));
  }

  // --- trace index ---------------------------------------------------------

  async insertTraceIndex(t: { ticketId: string; runId: string; kind: string; archivedAt: string }): Promise<void> {
    // Re-archiving the same run is idempotent, not an error.
    await this.d.insert(traces).values(t).onConflictDoNothing();
  }

  async listTraceIndex(ticketId: string): Promise<TraceIndexEntry[]> {
    const rows = await this.d
      .select({ runId: traces.runId, kind: traces.kind, archivedAt: traces.archivedAt })
      .from(traces)
      .where(eq(traces.ticketId, ticketId))
      .orderBy(traces.archivedAt);
    return rows;
  }

  // --- notifications -------------------------------------------------------

  /**
   * Queue a notification and return it with its assigned sequence.
   *
   * The seq is allocated with a subquery rather than a read-then-write, so two
   * concurrent notifications cannot both read the same MAX and collide on the
   * (ticket_id, seq) primary key.
   */
  async queueNotification(n: {
    ticketId: string;
    source: string;
    kind?: string;
    body: string;
    author?: string;
    urgent?: boolean;
  }): Promise<Notification> {
    const createdAt = new Date().toISOString();
    const row = {
      ticketId: n.ticketId,
      seq: sql<number>`(SELECT COALESCE(MAX(seq), 0) + 1 FROM notifications WHERE ticket_id = ${n.ticketId})`,
      source: n.source,
      kind: n.kind ?? "comment",
      body: n.body.slice(0, 8000),
      author: n.author ?? null,
      urgent: n.urgent ?? false,
      createdAt,
      readAt: null,
    };

    const [inserted] = await this.d.insert(notifications).values(row).returning();
    return inserted;
  }

  /** Unread notifications, oldest first. */
  async unreadNotifications(ticketId: string): Promise<Notification[]> {
    return this.d
      .select()
      .from(notifications)
      .where(and(eq(notifications.ticketId, ticketId), isNull(notifications.readAt)))
      .orderBy(notifications.seq);
  }

  /** Full queue including read receipts, newest first (for the UI). */
  async listNotifications(ticketId: string, limit = 100): Promise<Notification[]> {
    return this.d
      .select()
      .from(notifications)
      .where(eq(notifications.ticketId, ticketId))
      .orderBy(desc(notifications.seq))
      .limit(limit);
  }

  /** Mark notifications read up to a seq (a read point consumed them). */
  async markNotificationsRead(ticketId: string, upToSeq: number): Promise<void> {
    await this.d
      .update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(notifications.ticketId, ticketId),
          lte(notifications.seq, upToSeq),
          // Don't overwrite an existing receipt — the first read is the one
          // that consumed it.
          isNull(notifications.readAt),
        ),
      );
  }

  // --- scripts -------------------------------------------------------------

  async upsertScript(s: Script): Promise<void> {
    await this.d
      .insert(scripts)
      .values(s)
      .onConflictDoUpdate({
        target: [scripts.scope, scripts.name],
        // createdAt/createdBy are deliberately NOT updated — provenance
        // survives a rewrite.
        set: {
          description: s.description,
          code: s.code,
          args: s.args,
          statusGates: s.statusGates,
          updatedAt: s.updatedAt,
        },
      });
  }

  async getScript(scope: string, name: string): Promise<Script | null> {
    const [row] = await this.d
      .select()
      .from(scripts)
      .where(and(eq(scripts.scope, scope), eq(scripts.name, name)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Scripts visible to a repo: its own scope plus global, with the repo-scoped
   * one winning a name clash.
   */
  async listScripts(repo?: string): Promise<Script[]> {
    const scopes = repo ? [`repo:${repo}`, "global"] : ["global"];
    const rows = await this.d
      .select()
      .from(scripts)
      .where(inArray(scripts.scope, scopes))
      // scope DESC puts "repo:*" before "global", so the first row per name is
      // the winner.
      .orderBy(scripts.name, desc(scripts.scope));

    const seen = new Set<string>();
    const out: Script[] = [];
    for (const row of rows) {
      if (seen.has(row.name)) continue;
      seen.add(row.name);
      out.push(row);
    }
    return out;
  }

  /** All scripts across every scope — for the semantic index build. */
  async allScripts(): Promise<Script[]> {
    return this.d.select().from(scripts);
  }

  async deleteScript(scope: string, name: string): Promise<boolean> {
    const r = await this.d
      .delete(scripts)
      .where(and(eq(scripts.scope, scope), eq(scripts.name, name)));
    return (r.meta?.changes ?? 0) > 0;
  }
}

export type { ScriptArg };
