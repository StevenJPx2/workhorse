import type { LinkSide, RequestId } from "@workhorse/protocol";

/** A paired peer as the link rules see it: its name, key, and the operations it may call here. */
export type LinkPeer = {
  readonly name: string;
  readonly key: string;
  readonly operations: ReadonlySet<string>;
};

/** Paired peers by public key, so an acceptor can find who is dialing. */
export type Peers = ReadonlyMap<string, LinkPeer>;

/**
 * One link's handshake and life. The acceptor goes awaiting_hello, awaiting_proof,
 * checking_proof; the dialer goes hello_sent, checking_hello, proving. Both end ready or closed.
 * `own` is this side's key and fresh nonce; a new link always gets a new nonce.
 */
export type LinkState =
  | { readonly phase: "awaiting_hello"; readonly own: LinkSide }
  | {
      readonly phase: "awaiting_proof";
      readonly peer: LinkPeer;
      readonly version: number;
      readonly dialer: LinkSide;
      readonly own: LinkSide;
    }
  | {
      readonly phase: "checking_proof";
      readonly peer: LinkPeer;
      readonly version: number;
      readonly id: RequestId;
    }
  | { readonly phase: "hello_sent"; readonly peer: LinkPeer; readonly own: LinkSide }
  | {
      readonly phase: "checking_hello";
      readonly peer: LinkPeer;
      readonly version: number;
      readonly own: LinkSide;
      readonly acceptor: LinkSide;
    }
  | { readonly phase: "proving"; readonly peer: LinkPeer; readonly version: number }
  | { readonly phase: "ready"; readonly peer: LinkPeer; readonly version: number }
  | { readonly phase: "closed" };
