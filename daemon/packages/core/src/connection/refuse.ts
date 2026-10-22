import type { ErrorCode } from "@workhorse/protocol/constants";
import type { RequestId } from "@workhorse/protocol";
import type { Action } from "./action.ts";

/** Build a protocol refusal action without changing connection state. */
export function refuse(id: RequestId, code: ErrorCode, message: string): Action {
  return { type: "refuse", id, code, message };
}
