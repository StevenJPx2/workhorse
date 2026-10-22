import type { LinkMessage } from "@workhorse/protocol";
import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState } from "./link-state.ts";

/** The dialer's second message must be `link.prove`; its signature is checked against the paired key. */
export function onAwaitingProof(
  state: LinkState & { readonly phase: "awaiting_proof" },
  message: LinkMessage,
): LinkStep {
  if (message.type !== "prove") return closeLink("link.prove must follow link.hello");
  const { peer, version, dialer, own } = state;

  return {
    state: { phase: "checking_proof", peer, version, id: message.id },
    effects: [
      {
        type: "verify",
        key: peer.key,
        signature: message.params.signature,
        transcript: { signer: "dialer", dialer, acceptor: own },
      },
    ],
  };
}
