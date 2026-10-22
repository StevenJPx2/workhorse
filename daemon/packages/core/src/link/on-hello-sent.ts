import { SUPPORTED_VERSIONS } from "@workhorse/protocol/constants";
import type { LinkMessage } from "@workhorse/protocol";
import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState } from "./link-state.ts";

/**
 * The dialer's answer must come from the key the policy pairs with this peer, with a version
 * the dialer offered. Its signature is checked next.
 */
export function onHelloSent(
  state: LinkState & { readonly phase: "hello_sent" },
  message: LinkMessage,
): LinkStep {
  if (message.type !== "hello_result") return closeLink("link.hello refused");
  const { result } = message;
  const { peer, own } = state;

  if (result.key !== peer.key) return closeLink("answered by an unpaired key");

  if (!SUPPORTED_VERSIONS.includes(result.protocol))
    return closeLink("answered with an unsupported protocol version");
  const acceptor = { key: result.key, nonce: result.nonce };

  return {
    state: { phase: "checking_hello", peer, version: result.protocol, own, acceptor },
    effects: [
      {
        type: "verify",
        key: peer.key,
        signature: result.signature,
        transcript: { signer: "acceptor", dialer: own, acceptor },
      },
    ],
  };
}
