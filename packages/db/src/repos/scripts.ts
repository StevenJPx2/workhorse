// `db.scripts` — agent self-extension.

import { and, desc, eq, inArray } from "drizzle-orm";
import { type Script, scripts } from "../schema";
import { Repo } from "./base";

export class ScriptsRepo extends Repo {
  async upsert(s: Script): Promise<void> {
    await this.d
      .insert(scripts)
      .values(s)
      .onConflictDoUpdate({
        target: [scripts.scope, scripts.name],
        // createdAt/createdBy are deliberately absent — provenance (who first
        // created it, and when) survives a rewrite.
        set: {
          description: s.description,
          code: s.code,
          args: s.args,
          statusGates: s.statusGates,
          updatedAt: s.updatedAt,
        },
      });
  }

  async get(scope: string, name: string): Promise<Script | null> {
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
  async list(repo?: string): Promise<Script[]> {
    const scopes = repo ? [`repo:${repo}`, "global"] : ["global"];
    const rows = await this.d
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

  /**
   * All scripts across every scope — for the semantic index build.
   *
   * `list(repo)` is deliberately scoped, so indexing through it would only ever
   * see the scripts one repo can reach.
   */
  async all(): Promise<Script[]> {
    return this.d.select().from(scripts);
  }

  async delete(scope: string, name: string): Promise<boolean> {
    const r = await this.d.delete(scripts).where(and(eq(scripts.scope, scope), eq(scripts.name, name)));
    return (r.meta?.changes ?? 0) > 0;
  }
}
