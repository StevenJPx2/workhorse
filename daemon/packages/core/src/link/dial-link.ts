import { SUPPORTED_VERSIONS } from "@workhorse/protocol/constants";
import type { LinkSide } from "@workhorse/protocol";
import type { LinkStep } from "./link-effect.ts";
import type { LinkPeer } from "./link-state.ts";

/** A link this daemon opened to `peer`: send `link.hello` with every version it speaks. */
export function dialLink(peer: LinkPeer, own: LinkSide): LinkStep {
  return {
    state: { phase: "hello_sent", peer, own },
    effects: [
      {
        type: "send_hello",
        params: { protocol: [...SUPPORTED_VERSIONS], key: own.key, nonce: own.nonce },
      },
    ],
  };
}
