import type { ErrorCode } from "../constants.ts";
import type { RequestId } from "../jsonrpc.ts";
import type { LinkMessage } from "./link-message.ts";

/** A message from a peer that cannot be served, with the error its reply carries. */
export function linkInvalid(id: RequestId | null, code: ErrorCode, message: string): LinkMessage {
  return { type: "invalid", id, code, message };
}
