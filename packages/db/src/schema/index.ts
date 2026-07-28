// D1 schema — one file per table, re-exported here.
//
// This barrel is the single source of truth for the relational plane:
// `drizzle-kit generate` derives migrations from it, and the query layer derives
// its types from it. Adding a table means a new file plus a line here.

export { escalations } from "./escalations";
export type { Escalation, NewEscalation } from "./escalations";

export { notifications } from "./notifications";
export type { NewNotification, Notification } from "./notifications";

export { scripts } from "./scripts";
export type { NewScript, Script, ScriptArg } from "./scripts";

export { TICKET_STATUSES, tickets } from "./tickets";
export type { NewTicket, Ticket, TicketStatus } from "./tickets";

export { traces } from "./traces";
export type { NewTrace, Trace } from "./traces";
