import { ErrorCode } from "@workhorse/protocol/constants";
import type { LinkMessage } from "@workhorse/protocol";
import { agreeVersion } from "../connection/agree-version.ts";
import { refuse } from "../connection/refuse.ts";
import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState, Peers } from "./link-state.ts";

/**
 * The acceptor's first message must be `link.hello` from a paired key with a version both
 * speak. It answers with its own key, nonce and signature, then waits for the dialer's proof.
 */
export function onAwaitingHello(
  peers: Peers,
  state: LinkState & { readonly phase: "awaiting_hello" },
  message: LinkMessage,
): LinkStep {
  if (message.type !== "hello") return closeLink("link.hello must come first");
  const { id, params } = message;
  const peer = peers.get(params.key);

  if (peer === undefined) return closeLink("unknown key", refuse(id, ErrorCode.denied, "denied"));
  const version = agreeVersion(params.protocol);

  if (version === undefined) {
    return closeLink(
      "no common protocol version",
      refuse(id, ErrorCode.invalidParams, "unsupported protocol version"),
    );
  }

  const dialer = { key: params.key, nonce: params.nonce };
  const { own } = state;

  return {
    state: { phase: "awaiting_proof", peer, version, dialer, own },
    effects: [
      {
        type: "reply_hello",
        id,
        result: { protocol: version, key: own.key, nonce: own.nonce },
        sign: { signer: "acceptor", dialer, acceptor: own },
      },
    ],
  };
}
