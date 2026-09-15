// The stage write gate.
//
// A stage may always write its own artifact directory; beyond that it may write
// only paths matching its declared globs. An empty allowlist means no policy was
// set, which is open — the gate exists to honour a DECLARED restriction, not to
// invent one.
//
// This lives with the tools that enforce it rather than in the worker, because the
// tools are now ordinary importable factories and the gate has to travel with
// them.

import type { WritePolicy } from "@workhorse/api";

/** Translate a glob to a regex. `**` crosses separators; `*` does not. */
function globToRe(glob: string): RegExp {
  // A sentinel keeps `**` from being rewritten by the single-`*` pass that
  // follows it.
  const SENTINEL = "\u0000";
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, SENTINEL)
    .replace(/\*/g, "[^/]*")
    .split(SENTINEL)
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

/** Whether `path` is writable under `policy`. No policy at all = writable. */
export function writeAllowed(path: string, policy: WritePolicy | undefined): boolean {
  if (!policy) return true;
  if (path.startsWith(policy.dir)) return true;
  if (policy.writeAllow.length === 0) return true;

  // Globs are authored relative to the repo root, but a tool may be handed an
  // absolute path — match both spellings rather than making callers normalize.
  const rel = path.replace(/^\/workspace\/repo\//, "");
  return policy.writeAllow.some((g) => globToRe(g).test(path) || globToRe(g).test(rel));
}

/** The refusal message, naming the policy so the agent can see what it hit. */
export function blockedMessage(action: string, path: string, policy: WritePolicy | undefined): string {
  const declared = policy?.writeAllow.join(", ") || "read-only";
  return `${action} blocked: ${path} is outside this stage's write policy (${declared}).`;
}
