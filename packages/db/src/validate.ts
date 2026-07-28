// Script validation. Pure functions over untrusted input — an agent registers
// scripts through a tool, so this is a real trust boundary, not a formality.

import { TICKET_STATUSES } from "./schema";

const SCRIPT_NAME_RE = /^[a-z][a-z0-9_-]{1,63}$/;
const ARG_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const MAX_CODE_BYTES = 16_384;

/**
 * Statuses a script may gate on. A run-time script only makes sense while the
 * ticket is active, so terminal states (`done`, `errored`, `terminated`) and
 * operator-waiting states are not gateable.
 */
export const VALID_GATES = new Set<string>(
  TICKET_STATUSES.filter((s) => ["queued", "planning", "implementing", "ready-for-review", "in-review"].includes(s)),
);

export interface ScriptDraft {
  name?: string;
  code?: string;
  scope?: string;
  args?: unknown;
  statusGates?: unknown;
}

/** One field's check. Returns an error string, or null when the field is fine. */
type Check = (s: ScriptDraft) => string | null;

const checkName: Check = (s) =>
  !s.name || !SCRIPT_NAME_RE.test(s.name) ? "name must match ^[a-z][a-z0-9_-]{1,63}$" : null;

const checkCode: Check = (s) => {
  if (!s.code?.trim()) return "code required";
  return s.code.length > MAX_CODE_BYTES ? "code too long (16 KiB max)" : null;
};

const checkScope: Check = (s) =>
  !s.scope || (s.scope !== "global" && !s.scope.startsWith("repo:"))
    ? 'scope must be "global" or "repo:<owner/repo>"'
    : null;

const checkArgs: Check = (s) => {
  if (s.args === undefined) return null;
  if (!Array.isArray(s.args)) return "args must be an array";

  // A null entry would crash a naive `a.name` read downstream, so the optional
  // chain here is load-bearing rather than defensive.
  const bad = (s.args as Array<{ name?: string } | null>).some((a) => !a?.name || !ARG_NAME_RE.test(a.name));
  return bad ? "each arg needs a name matching ^[A-Za-z][A-Za-z0-9_]{0,31}$" : null;
};

const checkStatusGates: Check = (s) => {
  if (s.statusGates === undefined) return null;
  if (!Array.isArray(s.statusGates)) return "statusGates must be an array";

  const unknown = (s.statusGates as string[]).find((g) => !VALID_GATES.has(g));
  return unknown === undefined ? null : `unknown status gate "${unknown}"`;
};

// Order matters: it decides which error a caller sees first for input that is
// wrong in several ways at once.
const CHECKS: Check[] = [checkName, checkCode, checkScope, checkArgs, checkStatusGates];

/** Validate a script registration. Returns the first error, or null when valid. */
export function validateScript(s: ScriptDraft): string | null {
  for (const check of CHECKS) {
    const err = check(s);
    if (err) return err;
  }
  return null;
}
