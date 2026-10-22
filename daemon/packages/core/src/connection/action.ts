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
    };
