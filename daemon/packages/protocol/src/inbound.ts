import { Option, Schema } from "effect";
import { ErrorCode } from "./constants.ts";
import type { Frame } from "./framing.ts";
import { HelloParams } from "./hello.ts";
import { type Json, Request, type RequestId } from "./jsonrpc.ts";

// One line from a client, classified. Only `hello` is decoded here; other methods' params are
// decoded by their owner, so they pass through as JSON.
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

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));
const decodeRequest = Schema.decodeUnknownOption(Request);
const decodeHello = Schema.decodeUnknownOption(HelloParams);
const decodeId = Schema.decodeUnknownOption(Schema.Struct({ id: Request.fields.id }));

const invalid = (id: RequestId | null, code: ErrorCode, message: string): Inbound => ({
  type: "invalid",
  id,
  code,
  message,
});

export function readRequest(frame: Frame): Inbound {
  if (frame.type === "invalid_utf8") return invalid(null, ErrorCode.parseError, "invalid UTF-8");
  const json = Option.getOrUndefined(decodeJson(frame.text));

  if (json === undefined) return invalid(null, ErrorCode.parseError, "invalid JSON");
  const request = Option.getOrUndefined(decodeRequest(json));

  if (request === undefined) {
    // Echo the id when one can be read, so the client can match the error to its request.
    const id = Option.getOrUndefined(decodeId(json))?.id ?? null;

    return invalid(id, ErrorCode.invalidRequest, "not a JSON-RPC 2.0 request");
  }

  if (request.method !== "hello") {
    return { type: "call", id: request.id, method: request.method, params: request.params };
  }

  const params = Option.getOrUndefined(decodeHello(request.params));

  if (params === undefined)
    return invalid(request.id, ErrorCode.invalidParams, "hello needs protocol: [versions]");

  return { type: "hello", id: request.id, params };
}
