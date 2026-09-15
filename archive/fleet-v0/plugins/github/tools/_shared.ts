// Shared helpers for the github stage tools.
import { type Env, repoSlug as normalize, type ToolContext } from "@workhorse/api";

/** JSON-stringify a value, bounded for a tool result. */
export const j = (val: unknown) => JSON.stringify(val, null, 1).slice(0, 12_000);

/**
 * Resolve the target repo as `owner/name`: explicit arg, then the ticket's repo.
 *
 * BOTH inputs are normalized. `ctx.ticket.repo` is a CLONE URL in production —
 * `fileTicket` rewrites `acme/x` to `https://github.com/acme/x.git` — so
 * returning it verbatim built paths like
 * `/repos/https://github.com/acme/x.git/pulls/1`, which every gh tool sent to the
 * API. The mocked tests missed it because the fake ToolContext used a bare
 * `acme/widgets`, a shape production never stores.
 *
 * The explicit arg is normalized too: an agent that passes a URL it read from a
 * PR body should not get a different failure than one that passes a slug.
 */
export function repoSlug(ctx: ToolContext, explicit?: string): string {
  const raw = explicit || ctx.ticket.repo;
  if (!raw) throw new Error("no repo in ticket context — pass repo: owner/name");
  return normalize(raw);
}

export const asEnv = (ctx: ToolContext) => ctx.env as Env;
