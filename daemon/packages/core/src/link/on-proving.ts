import type { LinkMessage } from "@workhorse/protocol";
import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState } from "./link-state.ts";

/** The acceptor accepting the dialer's proof opens the link; a refusal closes it. */
export function onProving(
  state: LinkState & { readonly phase: "proving" },
  message: LinkMessage,
): LinkStep {
  if (message.type !== "prove_result") return closeLink("link.prove refused");
  const { peer, version } = state;

  return { state: { phase: "ready", peer, version }, effects: [{ type: "open", peer: peer.name }] };
}
