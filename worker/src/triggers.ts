// Trigger registry + firing. A trigger = source + prompt template +
// workflow + outcome routing, stored in KV (`trigger:<name>`). Core owns
// the cron scan and the generic fire endpoint; plugin webhooks call
// Core.fireTrigger when their surface produces a firing.

import type { Env, TriggerRecord } from "@workhorse/api";
import { fileTicket, type FileTicketResult } from "./tickets";

const KEY = (name: string) => `trigger:${name}`;
export const TRIGGER_NAME_RE = /^[a-z][a-z0-9-]{1,63}$/;

export async function listTriggers(env: Env): Promise<TriggerRecord[]> {
  const out: TriggerRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.TICKETS.list({ prefix: "trigger:", cursor });
    for (const k of page.keys) {
      const raw = await env.TICKETS.get(k.name);
      if (raw) out.push(JSON.parse(raw) as TriggerRecord);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTrigger(env: Env, name: string): Promise<TriggerRecord | null> {
  const raw = await env.TICKETS.get(KEY(name));
  return raw ? (JSON.parse(raw) as TriggerRecord) : null;
}

export function validateTrigger(t: Partial<TriggerRecord>): string | null {
  if (!t.name || !TRIGGER_NAME_RE.test(t.name)) return `name must match ${TRIGGER_NAME_RE}`;
  if (!t.source?.trim()) return "source required (cron | webhook | a plugin source kind)";
  if (!t.template?.trim()) return "template required";
  if (t.source === "cron") {
    if (!t.schedule) return "cron triggers need a schedule";
    const err = validateCron(t.schedule);
    if (err) return err;
  }
  if (!t.repo && !t.attachments?.some((a) => a.kind === "repo")) {
    return "repo required (directly or as a repo attachment)";
  }
  return null;
}

export async function putTrigger(env: Env, t: TriggerRecord): Promise<void> {
  await env.TICKETS.put(KEY(t.name), JSON.stringify(t));
}

export async function deleteTrigger(env: Env, name: string): Promise<void> {
  await env.TICKETS.delete(KEY(name));
}

/** Interpolate {{field}} slots from the payload ({{input}} = the main text). */
export function renderTemplate(template: string, payload: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => payload[key] ?? "");
}

/** Fire a trigger: render the template, file the ticket, stamp lastFiredAt. */
export async function fireTrigger(
  env: Env,
  name: string,
  payload: Record<string, string>,
): Promise<FileTicketResult> {
  const t = await getTrigger(env, name);
  if (!t) return { ok: false, error: `no trigger "${name}"`, status: 404 };
  if (!t.enabled) return { ok: false, error: `trigger "${name}" is disabled`, status: 409 };
  const prompt = renderTemplate(t.template, payload).trim();
  if (!prompt) return { ok: false, error: "template rendered empty", status: 422 };
  const r = await fileTicket(env, {
    repo: t.repo,
    prompt,
    title: `[${t.name}] ${prompt.slice(0, 50)}`,
    workflow: t.workflow,
    inputs: t.inputs,
    attachments: t.attachments,
  });
  if (r.ok) {
    t.lastFiredAt = new Date().toISOString();
    await putTrigger(env, t);
  }
  return r;
}

// ---- cron matching (five-field, UTC) ----------------------------------------

/** Validate a five-field cron expression; null when valid. */
export function validateCron(expr: string): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return "cron needs 5 fields (min hour dom mon dow)";
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ] as const;
  for (const [i, f] of fields.entries()) {
    if (f === "*") continue;
    for (const part of f.split(",")) {
      const m = part.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$|^\*\/(\d+)$/);
      if (!m) return `bad cron field "${f}"`;
      const nums = [m[1], m[2]].filter(Boolean).map(Number);
      if (nums.some((n) => n < ranges[i][0] || n > ranges[i][1])) {
        return `cron field "${f}" out of range`;
      }
    }
  }
  return null;
}

function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const step = part.match(/^\*\/(\d+)$/);
    if (step) return value % Number(step[1]) === 0;
    const range = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (range) {
      const [lo, hi, s] = [Number(range[1]), Number(range[2]), Number(range[3] ?? 1)];
      return value >= lo && value <= hi && (value - lo) % s === 0;
    }
    return Number(part) === value;
  });
}

/** Does the expression match this minute (UTC)? */
export function cronMatches(expr: string, at: Date): boolean {
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  return (
    fieldMatches(min, at.getUTCMinutes()) &&
    fieldMatches(hour, at.getUTCHours()) &&
    fieldMatches(dom, at.getUTCDate()) &&
    fieldMatches(mon, at.getUTCMonth() + 1) &&
    fieldMatches(dow, at.getUTCDay())
  );
}

/**
 * Cron sweep: fire every enabled cron trigger whose schedule matches the
 * current window. Runs from the worker's scheduled handler (15-min cadence),
 * so a trigger fires when its schedule matched any minute in the window
 * since the last sweep — with lastFiredAt as the dedupe.
 */
export async function sweepCronTriggers(env: Env, windowMinutes = 16): Promise<string[]> {
  const fired: string[] = [];
  const now = Date.now();
  for (const t of await listTriggers(env)) {
    if (!t.enabled || t.source !== "cron" || !t.schedule) continue;
    const last = t.lastFiredAt ? new Date(t.lastFiredAt).getTime() : 0;
    // Any minute in the sweep window matching the schedule (and after the
    // last firing) triggers one run.
    for (let m = 0; m < windowMinutes; m++) {
      const at = new Date(now - m * 60_000);
      if (at.getTime() <= last) break;
      if (cronMatches(t.schedule, at)) {
        const r = await fireTrigger(env, t.name, {
          input: `Scheduled run (${t.schedule}) at ${at.toISOString()}`,
          date: at.toISOString(),
        });
        fired.push(`${t.name}:${r.ok ? r.ticket.id : r.error}`);
        break;
      }
    }
  }
  return fired;
}
