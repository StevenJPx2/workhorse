import { ErrorCode } from "@workhorse/protocol/constants";
import type { RequestId } from "@workhorse/protocol";
import type { Refusal } from "./action.ts";

/** Why a capability request was denied. */
export type DenyReason = "no_grant" | "outside_root";

/** Build a capability-denied action for a request. */
export function deny(id: RequestId, capability: string, reason: DenyReason): Refusal {
  return {
    type: "refuse",
    id,
    code: ErrorCode.denied,
    message: "denied",
    data: { capability, reason },
  };
}
