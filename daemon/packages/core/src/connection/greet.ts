import { ErrorCode, SUPPORTED_VERSIONS } from "@workhorse/protocol/constants";
import type { RequestId } from "@workhorse/protocol";
import type { Action } from "./action.ts";
import { agreeVersion } from "./agree-version.ts";
import { newConnection } from "./new-connection.ts";
import type { Connection } from "./new-connection.ts";

/** State and requested actions produced by processing an inbound message. */
export type Step = { readonly connection: Connection; readonly effects: readonly Action[] };

/** Negotiate the highest supported protocol version offered by a client. */
export function greet(id: RequestId, offered: readonly number[]): Step {
  const agreed = agreeVersion(offered);

  if (agreed === undefined) {
    return {
      connection: newConnection,
      effects: [
        {
          type: "refuse",
          id,
          code: ErrorCode.invalidParams,
          message: "unsupported protocol version",
          data: { supported: [...SUPPORTED_VERSIONS] },
        },
      ],
    };
  }

  return {
    connection: { phase: "ready", version: agreed },
    effects: [{ type: "reply", id, result: { protocol: agreed } }],
  };
}
