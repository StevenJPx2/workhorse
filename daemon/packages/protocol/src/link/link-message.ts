import type { ErrorCode } from "../constants.ts";
import type { Outcome } from "../deployment/index.ts";
import type { Json, RequestId } from "../jsonrpc.ts";
import type { LinkHelloParams, LinkHelloResult, LinkProveParams } from "./handshake.ts";

/**
 * One WebSocket message from a peer, classified. Handshake messages are decoded; other params
 * pass through as JSON for their owner. A peer is authenticated but still untrusted input.
 */
export type LinkMessage =
  | { readonly type: "hello"; readonly id: RequestId; readonly params: LinkHelloParams }
  | { readonly type: "prove"; readonly id: RequestId; readonly params: LinkProveParams }
  | { readonly type: "hello_result"; readonly result: LinkHelloResult }
  | { readonly type: "prove_result" }
  | {
      readonly type: "call";
      readonly id: RequestId;
      readonly method: string;
      readonly params: Json | undefined;
    }
  | { readonly type: "notification"; readonly method: string }
  | { readonly type: "response"; readonly id: RequestId | null; readonly outcome: Outcome }
  | {
      readonly type: "invalid";
      readonly id: RequestId | null;
      readonly code: ErrorCode;
      readonly message: string;
    };
