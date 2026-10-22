import { ErrorCode } from "@workhorse/protocol/constants";
import { refuse } from "../connection/refuse.ts";
import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState } from "./link-state.ts";

/** A valid proof opens the link for the dialer's peer; anything else closes it. */
export function onCheckingProof(
  state: LinkState & { readonly phase: "checking_proof" },
  valid: boolean,
): LinkStep {
  const { peer, version, id } = state;

  if (!valid) return closeLink("bad signature", refuse(id, ErrorCode.denied, "denied"));

  return {
    state: { phase: "ready", peer, version },
    effects: [
      { type: "reply", id, result: {} },
      { type: "open", peer: peer.name },
    ],
  };
}
