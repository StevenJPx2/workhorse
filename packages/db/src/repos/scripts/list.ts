import { desc, inArray } from "drizzle-orm";
import { type Script, scripts } from "#schema";
import type { Conn } from "#repos/bind";

/**
 * Scripts visible to a repo: its own scope plus global, with the repo-scoped one
 * winning a name clash.
 */
export async function list(d: Conn, repo?: string): Promise<Script[]> {
  const scopes = repo ? [`repo:${repo}`, "global"] : ["global"];
  const rows = await d
    .select()
    .from(scripts)
    .where(inArray(scripts.scope, scopes))
    // scope DESC puts "repo:*" before "global", so the first row per name wins.
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
