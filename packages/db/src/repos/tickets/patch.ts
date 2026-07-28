import type { TicketRecord } from "@workhorse/api";
import type { Conn } from "../bind";
import { get } from "./get";
import { put } from "./put";

/**
 * Patch a ticket, returning prev+next so a transition hook can diff them.
 * Null when the ticket does not exist — a patch never creates one, which would
 * produce a record with no prompt.
 */
export async function patch(
  d: Conn,
  id: string,
  fields: Partial<TicketRecord>,
): Promise<{ prev: TicketRecord; next: TicketRecord } | null> {
  const prev = await get(d, id);
  if (!prev) return null;

  const next: TicketRecord = { ...prev, ...fields, updatedAt: new Date().toISOString() };
  await put(d, next);
  return { prev, next };
}
