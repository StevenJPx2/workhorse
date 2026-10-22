import type { ErrorCode } from "@workhorse/protocol/constants";
import type { Json, RequestId } from "@workhorse/protocol";

/** Pure effects requested by connection logic for the daemon to perform. */
export type Action =
  | { readonly type: "reply"; readonly id: RequestId; readonly result: Json }
  | {
      readonly type: "refuse";
      readonly id: RequestId | null;
      readonly code: ErrorCode;
      readonly message: string;
      readonly data?: Json;
    }
  | {
      readonly type: "call_app";
      readonly id: RequestId;
      readonly app: string;
      readonly operation: string;
      readonly params: Json | undefined;
    }
  | {
      readonly type: "call_peer";
      readonly id: RequestId;
      readonly peer: string;
      readonly method: string;
      readonly params: Json | undefined;
    };

/** An answer that refuses a request. */
export type Refusal = Extract<Action, { readonly type: "refuse" }>;

/** An action served on this daemon; a call from a peer only ever produces one of these. */
export type LocalAction = Exclude<Action, { readonly type: "call_peer" }>;
