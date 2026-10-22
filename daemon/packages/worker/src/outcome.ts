import type { DenyReason } from "@workhorse/core";
import { ErrorCode } from "@workhorse/protocol/constants";
import type { Outcome, RequestId, Response } from "@workhorse/protocol";

export function failed(reason: string): Outcome {
  return { error: { code: ErrorCode.failed, message: "failed", data: { reason } } };
}

export function denied(capability: string, reason: DenyReason): Outcome {
  return { error: { code: ErrorCode.denied, message: "denied", data: { capability, reason } } };
}

export function invalidParams(message: string): Outcome {
  return { error: { code: ErrorCode.invalidParams, message } };
}

export const unavailable: Outcome = {
  error: { code: ErrorCode.unavailable, message: "unavailable" },
};

export function toResponse(id: RequestId, outcome: Outcome): Response {
  return "result" in outcome
    ? { jsonrpc: "2.0", id, result: outcome.result }
    : { jsonrpc: "2.0", id, error: outcome.error };
}
