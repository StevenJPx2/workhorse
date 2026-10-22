import { Option, Schema } from "effect";
import { ErrorCode } from "../constants.ts";
import type { Request } from "../jsonrpc.ts";
import { LinkHelloParams, LinkProveParams } from "./handshake.ts";
import { linkInvalid } from "./link-invalid.ts";
import type { LinkMessage } from "./link-message.ts";

const decodeHello = Schema.decodeUnknownOption(LinkHelloParams);
const decodeProve = Schema.decodeUnknownOption(LinkProveParams);

/** A request from a peer: the two handshake requests are decoded, any other is a call. */
export function readLinkRequest(request: Request): LinkMessage {
  const { id, method, params } = request;

  if (method === "link.hello") {
    const hello = Option.getOrUndefined(decodeHello(params));

    return hello === undefined
      ? linkInvalid(id, ErrorCode.invalidParams, "link.hello needs protocol, key and nonce")
      : { type: "hello", id, params: hello };
  }

  if (method === "link.prove") {
    const prove = Option.getOrUndefined(decodeProve(params));

    return prove === undefined
      ? linkInvalid(id, ErrorCode.invalidParams, "link.prove needs a signature")
      : { type: "prove", id, params: prove };
  }

  return { type: "call", id, method, params };
}
