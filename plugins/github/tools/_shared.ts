// Shared helpers for the github stage tools.
import type { Env, ToolContext } from "@workhorse/api";

/** JSON-stringify a value, bounded for a tool result. */
export const j = (val: unknown) => JSON.stringify(val, null, 1).slice(0, 12_000);

/** Resolve the target repo slug: explicit arg → the ticket's repo → error. */
export function repoSlug(ctx: ToolContext, explicit?: string): string {
  if (explicit) return explicit;
  if (ctx.ticket.repo) return ctx.ticket.repo;
  throw new Error("no repo in ticket context — pass repo: owner/name");
}

export const asEnv = (ctx: ToolContext) => ctx.env as Env;
