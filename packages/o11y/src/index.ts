// @workhorse/o11y — structured events for the fleet.
//
// Built on evlog (zero runtime dependencies, Workers adapter, OTLP drain
// available). The point is NOT to wrap console.log: it is that a ticket's life
// spans a Worker request, a durable Workflow instance, and N sandboxed stage
// sessions, and today those correlate only by grepping for a ticket id in
// unstructured strings.
//
// Every event here carries `ticketId` and (where it exists) `runId` and `stage`,
// so one query returns the whole run.

export { initLogging, log } from "./logger";
export type { StageEvent, TicketEvent } from "./events";
export { stageEvent, ticketEvent } from "./events";
