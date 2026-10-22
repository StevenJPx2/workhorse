import { Option, Schema } from "effect";
import { ErrorCode } from "../constants.ts";
import type { Frame } from "../framing/index.ts";
import { HelloParams } from "../hello.ts";
import { Request } from "../jsonrpc.ts";
import type { Inbound } from "./inbound.ts";
import { invalid } from "./invalid.ts";

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));
const decodeRequest = Schema.decodeUnknownOption(Request);
const decodeHello = Schema.decodeUnknownOption(HelloParams);
const decodeId = Schema.decodeUnknownOption(Schema.Struct({ id: Request.fields.id }));

/** Decode one framed line from a client into a `hello`, a method call, or an invalid line. */
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
