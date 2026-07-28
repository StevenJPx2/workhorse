import { and, eq } from "drizzle-orm";
import { scripts } from "../../schema";
import type { Conn } from "../bind";

/** Delete one script; true when a row was actually removed. */
export async function remove(d: Conn, scope: string, name: string): Promise<boolean> {
  const r = await d.delete(scripts).where(and(eq(scripts.scope, scope), eq(scripts.name, name)));
  return (r.meta?.changes ?? 0) > 0;
}
