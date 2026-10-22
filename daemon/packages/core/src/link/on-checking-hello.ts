import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState } from "./link-state.ts";

/** A valid acceptor signature lets the dialer prove its own key; anything else closes the link. */
export function onCheckingHello(
  state: LinkState & { readonly phase: "checking_hello" },
  valid: boolean,
): LinkStep {
  if (!valid) return closeLink("bad signature from the peer");
  const { peer, version, own, acceptor } = state;

  return {
    state: { phase: "proving", peer, version },
    effects: [{ type: "send_prove", sign: { signer: "dialer", dialer: own, acceptor } }],
  };
}
