import { Option, Schema } from "effect";
import { ErrorCode } from "../constants.ts";
import { Notification, Request, Response } from "../jsonrpc.ts";
import { linkInvalid } from "./link-invalid.ts";
import type { LinkMessage } from "./link-message.ts";
import { readLinkRequest } from "./read-link-request.ts";
import { readLinkResponse } from "./read-link-response.ts";

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));
const decodeRequest = Schema.decodeUnknownOption(Request);
const decodeNotification = Schema.decodeUnknownOption(Notification);
const decodeResponse = Schema.decodeUnknownOption(Response);

/** Decode one text message from a link. */
export function readLinkMessage(text: string): LinkMessage {
  const json = Option.getOrUndefined(decodeJson(text));

  if (json === undefined) return linkInvalid(null, ErrorCode.parseError, "invalid JSON");
  const request = Option.getOrUndefined(decodeRequest(json));

  if (request !== undefined) return readLinkRequest(request);
  const notification = Option.getOrUndefined(decodeNotification(json));

  if (notification !== undefined) return { type: "notification", method: notification.method };
  const response = Option.getOrUndefined(decodeResponse(json));

  return response === undefined
    ? linkInvalid(null, ErrorCode.invalidRequest, "not a JSON-RPC 2.0 message")
    : readLinkResponse(response);
}
