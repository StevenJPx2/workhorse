/**
 * Model escalation policy: one stage-restart mechanism, two triggers.
 *
 * - Availability-driven FALLBACK: a stage died on a model failure (429,
 *   credit exhaustion, expired token — failureKind "model"). Retry the
 *   stage down the credential/provider legs below, same capability tier.
 * - Capability-driven PROMOTION (delegation): the agent itself signalled
 *   "not equipped" via a `delegate` field in its control block. Re-run the
 *   stage one model UP the promotion chain, upstream artifacts intact.
 *
 * Every escalation is recorded in the trace archive (esc:<ticket>:<run>,
 * merged into trace:<ticket>:<run>) so evals can mine which stages
 * genuinely need a bigger model.
 */

export interface FallbackLeg {
  /** Optional model override for the remaining run (default: keep). */
  model?: string;
}

/**
 * Availability legs, tried in order after the initial run dies on a model
 * failure. The fleet is OAuth-only, so every leg re-injects a fresh
 * custodian token and resumes — the dominant observed failure is an
 * expired OAuth access token, and 429s get the workflow step's retry
 * delay as backoff. Two legs = two escalated retries before the run is
 * declared dead.
 */
export const FALLBACK_LEGS: FallbackLeg[] = [{}, {}];

/**
 * Capability promotion chain, weakest → strongest. A delegating stage is
 * re-run on the model AFTER its current one; a stage already at the top
 * cannot promote (its delegate signal is then ignored and the run
 * proceeds with whatever it produced).
 */
export const PROMOTION_CHAIN = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

/**
 * What a stage runs on when no explicit model was configured anywhere
 * (ticket override or spec default). Used only to position an unknown
 * current model inside the promotion chain.
 */
export const DEFAULT_BASE_MODEL = "claude-sonnet-4-6";

/** Hard cap on promotions per run (cost guard). */
export const MAX_PROMOTIONS = 2;

/** Pick the next model up the chain, or undefined when already at the top. */
export function nextModelUp(chain: string[], current: string | undefined): string | undefined {
  const cur = current ?? DEFAULT_BASE_MODEL;
  const idx = chain.indexOf(cur);
  if (idx >= 0) return chain[idx + 1];
  // Unknown current model: promote to the strongest chain entry (unless
  // that IS the current model already).
  const top = chain[chain.length - 1];
  return top !== cur ? top : undefined;
}
