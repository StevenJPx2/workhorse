// Context refs: parse-from-chat + frecency ranking.
//
// The operator no longer manually "attaches" context. They just type a message
// that may CONTAIN refs (a repo slug, a Jira key, a Slack link); we parse them
// via the plugin attachment providers' match(), record each used ref's usage,
// and rank previously-used refs by frecency (frequency × recency) so the home
// composer can offer them as one-tap chips. The agent enriches a ref's content
// on demand via a tool — nothing is pre-resolved at dispatch.

import type { Env } from "@workhorse/api";
import { attachmentProviders } from "./plugins";

export interface ParsedRef {
  kind: string;
  ref: string;
  label: string;
  icon?: string;
}

/**
 * Scan free text for context refs using every plugin provider's match(). A
 * provider's match() is cheap + synchronous by contract. Tokens are matched
 * whole-ish (split on whitespace) plus the raw string (for URL providers).
 * Dedupes by kind:ref.
 */
export function parseRefs(input: string): ParsedRef[] {
  const providers = [...attachmentProviders().values()];
  const out = new Map<string, ParsedRef>();
  // Candidate substrings: whole string + each whitespace token + repo-ish slugs.
  const tokens = new Set<string>([input, ...input.split(/\s+/).filter(Boolean)]);
  for (const tok of tokens) {
    for (const p of providers) {
      let ref: string | null = null;
      try {
        ref = p.match(tok);
      } catch {
        ref = null;
      }
      if (!ref) continue;
      const key = `${p.kind}:${ref}`;
      if (!out.has(key)) out.set(key, { kind: p.kind, ref, label: p.label, icon: p.icon });
    }
  }
  return [...out.values()];
}

// --- frecency store (KV; small per-ref counters, hot-path reads) ------------
const KEY = "reffrecency:v1";
const HALF_LIFE_MS = 14 * 24 * 3600_000; // 14 days

interface RefStat {
  kind: string;
  ref: string;
  label?: string;
  icon?: string;
  count: number;
  lastUsed: number; // epoch ms
}

/** Record that a set of refs was actually used (on dispatch). Best-effort. */
export async function recordRefUse(env: Env, refs: ParsedRef[]): Promise<void> {
  if (!refs.length) return;
  try {
    const raw = await env.TICKETS.get(KEY);
    const map: Record<string, RefStat> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    for (const r of refs) {
      const k = `${r.kind}:${r.ref}`;
      const cur = map[k];
      map[k] = {
        kind: r.kind,
        ref: r.ref,
        label: r.label ?? cur?.label,
        icon: r.icon ?? cur?.icon,
        count: (cur?.count ?? 0) + 1,
        lastUsed: now,
      };
    }
    await env.TICKETS.put(KEY, JSON.stringify(map));
  } catch {
    /* frecency is a nicety; never block dispatch */
  }
}

/** Frecency-ranked refs (frequency × exponential recency decay). */
export async function rankedRefs(env: Env, limit = 8): Promise<ParsedRef[]> {
  try {
    const raw = await env.TICKETS.get(KEY);
    if (!raw) return [];
    const map: Record<string, RefStat> = JSON.parse(raw);
    const now = Date.now();
    return Object.values(map)
      .map((s) => ({ s, score: s.count * Math.pow(0.5, (now - s.lastUsed) / HALF_LIFE_MS) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ s }) => ({ kind: s.kind, ref: s.ref, label: s.label ?? s.ref, icon: s.icon }));
  } catch {
    return [];
  }
}
