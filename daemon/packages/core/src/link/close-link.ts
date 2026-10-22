import type { Refusal } from "../connection/index.ts";
import type { LinkStep } from "./link-effect.ts";

/** End a link: optionally refuse the request that broke the rules first, then close. */
export function closeLink(reason: string, refusal?: Refusal): LinkStep {
  return {
    state: { phase: "closed" },
    effects:
      refusal === undefined ? [{ type: "close", reason }] : [refusal, { type: "close", reason }],
  };
}
