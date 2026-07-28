// tickets tools — fetch_context (stage) + the fleet-chat operator tools (chat).
import type { ToolFactory } from "@workhorse/api";
import fetch_context from "./fetch_context";
import workhorse_file_ticket from "./workhorse_file_ticket";
import workhorse_find_workflow from "./workhorse_find_workflow";
import workhorse_list_tickets from "./workhorse_list_tickets";
import workhorse_ticket_diff from "./workhorse_ticket_diff";
import workhorse_ticket_status from "./workhorse_ticket_status";

export const ticketsTools: ToolFactory[] = [
  fetch_context,
  workhorse_file_ticket,
  workhorse_list_tickets,
  workhorse_ticket_status,
  workhorse_ticket_diff,
  workhorse_find_workflow,
];
