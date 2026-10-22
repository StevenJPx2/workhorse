import type { LinkMessage } from "@workhorse/protocol";
import type { Apps } from "../connection/index.ts";
import { closeLink } from "./close-link.ts";
import type { LinkStep } from "./link-effect.ts";
import type { LinkState, Peers } from "./link-state.ts";
import { onAwaitingHello } from "./on-awaiting-hello.ts";
import { onAwaitingProof } from "./on-awaiting-proof.ts";
import { onCheckingHello } from "./on-checking-hello.ts";
import { onCheckingProof } from "./on-checking-proof.ts";
import { onHelloSent } from "./on-hello-sent.ts";
import { onProving } from "./on-proving.ts";
import { onReady } from "./on-ready.ts";

/** What a link reacts to: a message from the peer, or the answer to a `verify` effect. */
export type LinkEvent =
  | { readonly type: "message"; readonly message: LinkMessage }
  | { readonly type: "verified"; readonly valid: boolean };

/** What the link rules need to know: the apps here and the paired peers. */
export type LinkContext = { readonly apps: Apps; readonly peers: Peers };

/**
 * Advance one link by one event. The daemon feeds events one at a time and performs each
 * step's effects before the next, so a verification always answers the state that asked for it.
 */
export function linkStep(context: LinkContext, state: LinkState, event: LinkEvent): LinkStep {
  if (state.phase === "closed") return { state, effects: [] };

  if (event.type === "verified") {
    if (state.phase === "checking_proof") return onCheckingProof(state, event.valid);

    if (state.phase === "checking_hello") return onCheckingHello(state, event.valid);

    return closeLink("verification answered nothing");
  }

  const { message } = event;

  switch (state.phase) {
    case "awaiting_hello":
      return onAwaitingHello(context.peers, state, message);
    case "awaiting_proof":
      return onAwaitingProof(state, message);
    case "hello_sent":
      return onHelloSent(state, message);
    case "proving":
      return onProving(state, message);
    case "ready":
      return onReady(context.apps, state, message);
    case "checking_proof":
    case "checking_hello":
      return closeLink("message while verifying");
    default: {
      // Every phase is handled above; a new phase fails to compile here.
      const unhandled: never = state;

      return unhandled;
    }
  }
}
