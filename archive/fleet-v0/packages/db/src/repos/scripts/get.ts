import { and, eq } from "drizzle-orm";
import { type Script, scripts } from "#schema";
import type { Conn } from "#repos/bind";

/** One script by its (scope, name) identity. */
export async function get(d: Conn, scope: string, name: string): Promise<Script | null> {
  const [row] = await d
    .select()
    .from(scripts)
    .where(and(eq(scripts.scope, scope), eq(scripts.name, name)))
    .limit(1);
  return row ?? null;
}
