import type { ErrorCode } from "@workhorse/protocol/constants";
import type { RequestId } from "@workhorse/protocol";
import type { Refusal } from "./action.ts";

/** Build a protocol refusal action without changing connection state. */
export function refuse(id: RequestId, code: ErrorCode, message: string): Refusal {
  return { type: "refuse", id, code, message };
}
