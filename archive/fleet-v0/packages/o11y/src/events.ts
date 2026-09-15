// The event vocabulary.
//
// Free-form logging would leave every call site inventing its own field names,
// and a query for "how long does the review stage take" would depend on whoever
// wrote that log line having picked `stage` over `stageId` or `phase`. These two
// builders are the whole vocabulary.

/** A ticket-lifecycle event: filing, dispatch, healing, parking, completion. */
export interface TicketEvent {
  ticketId: string;
  /** Present once a run exists — absent at filing time. */
  runId?: string;
  repo?: string;
  /** What happened, past tense: "filed", "dispatched", "healed", "parked". */
  event: string;
  /** Anything specific to this event. Flat: nested objects do not index well. */
  [field: string]: unknown;
}

/** A stage event within a run: one agent session's start, finish, or verdict. */
export interface StageEvent extends TicketEvent {
  stage: string;
  /** Which pass over this stage — loop-backs revisit the same id. */
  round?: number;
}

/**
 * A ticket event, with the fields ordered so the identity reads first.
 *
 * Returns rather than emits: the caller decides the severity, and an event
 * built but not emitted costs nothing.
 */
export function ticketEvent(e: TicketEvent): Record<string, unknown> {
  const { ticketId, runId, repo, event, ...rest } = e;
  return { ticketId, ...(runId ? { runId } : {}), ...(repo ? { repo } : {}), event, ...rest };
}

/** A stage event. Same shape, with the stage identity guaranteed present. */
export function stageEvent(e: StageEvent): Record<string, unknown> {
  const { stage, round, ...ticket } = e;
  return { ...ticketEvent(ticket as TicketEvent), stage, ...(round === undefined ? {} : { round }) };
}
