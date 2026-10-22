import { ErrorCode } from "@workhorse/protocol/constants";
import type { LinkMessage } from "@workhorse/protocol";
import type { Apps } from "../connection/index.ts";
import { refuse } from "../connection/refuse.ts";
import type { LinkEffect, LinkStep } from "./link-effect.ts";
import type { LinkState } from "./link-state.ts";
import { routePeerCall } from "./route-peer-call.ts";

/**
 * An open link: calls from the peer go to apps here within its grants, answers settle this
 * side's calls, and heartbeats need nothing. A second handshake is refused.
 */
export function onReady(
  apps: Apps,
  state: LinkState & { readonly phase: "ready" },
  message: LinkMessage,
): LinkStep {
  const stay = (...effects: readonly LinkEffect[]): LinkStep => ({ state, effects });

  switch (message.type) {
    case "call":
      return stay(
        routePeerCall(apps, state.peer.operations, message.id, message.method, message.params),
      );
    case "hello":
    case "prove":
      return stay(refuse(message.id, ErrorCode.invalidRequest, "handshake already done"));
    case "response":
      return stay({ type: "settle", id: message.id, outcome: message.outcome });
    case "invalid":
      return stay({ type: "refuse", id: message.id, code: message.code, message: message.message });
    case "notification":
    case "hello_result":
    case "prove_result":
      return stay();
    default: {
      // Every message is handled above; a new kind fails to compile here.
      const unhandled: never = message;

      return unhandled;
    }
  }
}
