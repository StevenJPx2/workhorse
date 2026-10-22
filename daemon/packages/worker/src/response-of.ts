import type { Action } from "@workhorse/core";
import type { Response } from "@workhorse/protocol";

/** The response for an action core already answered: a reply, or a refusal with data only when there is data. */
export function responseOf(
  action: Extract<Action, { readonly type: "reply" | "refuse" }>,
): Response {
  if (action.type === "reply") return { jsonrpc: "2.0", id: action.id, result: action.result };
  const error = { code: action.code, message: action.message };

  return {
    jsonrpc: "2.0",
    id: action.id,
    error: action.data === undefined ? error : { ...error, data: action.data },
  };
}
