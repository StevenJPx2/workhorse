import type { ErrorCode } from "../constants.ts";
import type { HelloParams } from "../hello.ts";
import type { Json, RequestId } from "../jsonrpc.ts";

/**
 * One line from a client, classified. Only `hello` is decoded here; other methods' params are
 * decoded by their owner, so they pass through as JSON.
 */
export type Inbound =
  | { readonly type: "hello"; readonly id: RequestId; readonly params: HelloParams }
  | {
      readonly type: "call";
      readonly id: RequestId;
      readonly method: string;
      readonly params: Json | undefined;
    }
  | {
      readonly type: "invalid";
      readonly id: RequestId | null;
      readonly code: ErrorCode;
      readonly message: string;
    };
