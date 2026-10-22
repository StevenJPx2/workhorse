import { Option, Schema } from "effect";
import type { Outcome } from "../deployment/index.ts";
import type { Response } from "../jsonrpc.ts";
import { HELLO_ID, LinkHelloResult, PROVE_ID } from "./handshake.ts";
import type { LinkMessage } from "./link-message.ts";

const decodeHelloResult = Schema.decodeUnknownOption(LinkHelloResult);

/**
 * A response from a peer. Our own handshake requests use fixed ids, so their results are
 * decoded; a malformed `link.hello` result stays a plain response, which the handshake refuses.
 */
export function readLinkResponse(response: Response): LinkMessage {
  const outcome: Outcome =
    "result" in response ? { result: response.result } : { error: response.error };

  if ("result" in response && response.id === HELLO_ID) {
    const result = Option.getOrUndefined(decodeHelloResult(response.result));

    if (result !== undefined) return { type: "hello_result", result };
  }

  if ("result" in response && response.id === PROVE_ID) return { type: "prove_result" };

  return { type: "response", id: response.id, outcome };
}
