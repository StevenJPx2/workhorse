import type { TicketRecord } from "@workhorse/api";
import { desc, eq } from "drizzle-orm";
import { type TicketStatus, tickets } from "#schema";
import type { Conn } from "#repos/bind";
import { toTicketRecord } from "./map";

/** Tickets newest first, optionally filtered by status. */
export async function list(d: Conn, status?: string): Promise<TicketRecord[]> {
  const q = d.select().from(tickets).orderBy(desc(tickets.createdAt));
  const rows = await (status ? q.where(eq(tickets.status, status as TicketStatus)) : q);
  return rows.map(toTicketRecord);
}
