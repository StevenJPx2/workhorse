import { escalations, type NewEscalation } from "#schema";
import type { Conn } from "#repos/bind";

/**
 * Record a model swap. Repeated identical escalations are kept: two 429s in one
 * run is real history, not a duplicate to collapse.
 */
export async function insert(d: Conn, e: NewEscalation): Promise<void> {
  await d.insert(escalations).values(e);
}
