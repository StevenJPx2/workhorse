import type { TicketRecord } from "@workhorse/api";
import { eq } from "drizzle-orm";
import { tickets } from "#schema";
import type { Conn } from "#repos/bind";
import { toTicketRecord } from "./map";

/** One ticket, or null when it does not exist. */
export async function get(d: Conn, id: string): Promise<TicketRecord | null> {
  const [row] = await d.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return row ? toTicketRecord(row) : null;
}
