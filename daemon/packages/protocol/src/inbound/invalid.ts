import type { ErrorCode } from "../constants.ts";
import type { RequestId } from "../jsonrpc.ts";
import type { Inbound } from "./inbound.ts";

/** A line that cannot be served, with the error code and message its reply carries. */
export function invalid(id: RequestId | null, code: ErrorCode, message: string): Inbound {
  return { type: "invalid", id, code, message };
}
