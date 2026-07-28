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

/** Validate a script registration. Returns an error string, or null when valid. */
export function validateScript(s: ScriptDraft): string | null {
  if (!s.name || !SCRIPT_NAME_RE.test(s.name)) return "name must match ^[a-z][a-z0-9_-]{1,63}$";
  if (!s.code?.trim()) return "code required";
  if (s.code.length > MAX_CODE_BYTES) return "code too long (16 KiB max)";

  if (!s.scope || (s.scope !== "global" && !s.scope.startsWith("repo:"))) {
    return 'scope must be "global" or "repo:<owner/repo>"';
  }

  if (s.args !== undefined) {
    if (!Array.isArray(s.args)) return "args must be an array";
    for (const a of s.args as Array<{ name?: string }>) {
      if (!a?.name || !ARG_NAME_RE.test(a.name)) {
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
