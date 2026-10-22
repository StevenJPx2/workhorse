import type { LinkSide } from "@workhorse/protocol";
import type { LinkState } from "./link-state.ts";

/** A link someone dialed: wait for `link.hello`. `own` carries a fresh nonce for this link only. */
export function acceptLink(own: LinkSide): LinkState {
  return { phase: "awaiting_hello", own };
}
