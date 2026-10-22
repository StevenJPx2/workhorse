import { Option, Schema } from "effect";
import { ErrorCode } from "../constants.ts";
import {
  type ErrorObject,
  type Json,
  Notification,
  Request,
  type RequestId,
  Response,
} from "../jsonrpc.ts";

/** One WebSocket message from a peer, classified. Params pass through as JSON for their owner. */
export type LinkMessage =
  | {
      readonly type: "request";
      readonly id: RequestId;
      readonly method: string;
      readonly params: Json | undefined;
    }
  | { readonly type: "notification"; readonly method: string }
  | {
      readonly type: "response";
      readonly id: RequestId | null;
      readonly outcome: { readonly result: Json } | { readonly error: ErrorObject };
    }
  | { readonly type: "invalid"; readonly code: ErrorCode; readonly message: string };

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));
const decodeRequest = Schema.decodeUnknownOption(Request);
const decodeNotification = Schema.decodeUnknownOption(Notification);
const decodeResponse = Schema.decodeUnknownOption(Response);

/** Decode one text message from a link. A peer is authenticated but still untrusted input. */
export function readLinkMessage(text: string): LinkMessage {
  const json = Option.getOrUndefined(decodeJson(text));

  if (json === undefined)
    return { type: "invalid", code: ErrorCode.parseError, message: "invalid JSON" };
  const request = Option.getOrUndefined(decodeRequest(json));

  if (request !== undefined)
    return { type: "request", id: request.id, method: request.method, params: request.params };
  const notification = Option.getOrUndefined(decodeNotification(json));

  if (notification !== undefined) return { type: "notification", method: notification.method };
  const response = Option.getOrUndefined(decodeResponse(json));

  if (response === undefined)
    return {
      type: "invalid",
      code: ErrorCode.invalidRequest,
      message: "not a JSON-RPC 2.0 message",
    };

  return {
    type: "response",
    id: response.id,
    outcome: "result" in response ? { result: response.result } : { error: response.error },
  };
}
