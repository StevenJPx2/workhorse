import { type Script, scripts } from "../../schema";
import type { Conn } from "../bind";

/**
 * Every script across every scope — for the semantic index build.
 *
 * `list(repo)` is deliberately scoped, so indexing through it would only ever
 * see the scripts one repo can reach.
 */
export async function all(d: Conn): Promise<Script[]> {
  return d.select().from(scripts);
}
