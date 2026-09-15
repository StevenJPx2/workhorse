// `db.escalations` — model swaps during a run.
//
// Two triggers, and the distinction matters: `fallback` is an AVAILABILITY swap
// (same capability, other credential, after a 429/401/5xx); `promotion` is a
// CAPABILITY swap (a bigger model because the agent stalled). Fallback is
// exhausted first — promoting on a throttle pays more to fix something a bigger
// model cannot.

export { forRun } from "./for-run";
export { insert } from "./insert";
