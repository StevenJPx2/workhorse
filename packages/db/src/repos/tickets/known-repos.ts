import { desc, max } from "drizzle-orm";
import { tickets } from "#schema";
import type { Conn } from "#repos/bind";

/** Repos seen in the fleet, most recently used first (home-page chips). */
export async function knownRepos(d: Conn, limit = 20): Promise<string[]> {
  const rows = await d
    .select({ repo: tickets.repo, last: max(tickets.updatedAt) })
    .from(tickets)
    .groupBy(tickets.repo)
    // By each repo's LATEST ticket — a plain DISTINCT would order by whichever
    // row the planner happened to see first.
    .orderBy(desc(max(tickets.updatedAt)))
    .limit(limit);
  return rows.map((r) => r.repo);
}
