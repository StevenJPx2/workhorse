import type { TicketRecord } from "@workhorse/api";
import { tickets } from "../../schema";
import type { Conn } from "../bind";
import { toTicketRow } from "./map";

/** Insert or fully replace a ticket. */
export async function put(d: Conn, rec: TicketRecord): Promise<void> {
  const row = toTicketRow(rec);
  await d
    .insert(tickets)
    .values(row)
    // Not INSERT OR REPLACE, which DELETEs then INSERTs — firing delete triggers
    // and losing any column absent from the statement.
    .onConflictDoUpdate({ target: tickets.id, set: row });
}
