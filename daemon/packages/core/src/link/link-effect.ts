import type { LinkRole, LinkSide, Outcome, RequestId } from "@workhorse/protocol";
import type { LocalAction } from "../connection/index.ts";
import type { LinkState } from "./link-state.ts";

/** What a side signs, or checks a signature over; the worker turns it into `linkTranscript` bytes. */
export type Transcript = {
  readonly signer: LinkRole;
  readonly dialer: LinkSide;
  readonly acceptor: LinkSide;
};

/**
 * What the link rules ask the daemon to do. Signing, verifying and sending are effects, so the
 * rules stay pure; a verification's answer comes back as a `verified` event.
 */
export type LinkEffect =
  | LocalAction
  | {
      readonly type: "send_hello";
      readonly params: {
        readonly protocol: readonly number[];
        readonly key: string;
        readonly nonce: string;
      };
    }
  | {
      readonly type: "reply_hello";
      readonly id: RequestId;
      readonly result: { readonly protocol: number; readonly key: string; readonly nonce: string };
      readonly sign: Transcript;
    }
  | { readonly type: "send_prove"; readonly sign: Transcript }
  | {
      readonly type: "verify";
      readonly key: string;
      readonly signature: string;
      readonly transcript: Transcript;
    }
  | { readonly type: "settle"; readonly id: RequestId | null; readonly outcome: Outcome }
  | { readonly type: "open"; readonly peer: string }
  | { readonly type: "close"; readonly reason: string };

/** A link's next state and the effects to perform, in order. */
export type LinkStep = { readonly state: LinkState; readonly effects: readonly LinkEffect[] };
