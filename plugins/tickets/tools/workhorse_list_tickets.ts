// workhorse_list_tickets — fleet overview (chat surface).
import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "workhorse_list_tickets",
  surfaces: ["chat"],
  description: "List Workhorse fleet tickets (id, title, status, PR url), newest first.",
  input: v.object({}),
  async run({ core }) {
    const tickets = await core.listTickets();
    if (!tickets.length) return "No tickets yet.";
    return tickets
      .slice(0, 25)
      .map((t) => `${t.id}  [${t.status}]  ${t.title}${t.prUrl ? `  → ${t.prUrl}` : ""}  (${t.updatedAt})`)
      .join("\n");
  },
});
