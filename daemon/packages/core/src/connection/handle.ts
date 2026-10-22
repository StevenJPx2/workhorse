import { ErrorCode } from "@workhorse/protocol/constants";
import type { Inbound } from "@workhorse/protocol";
import type { Action } from "./action.ts";
import { greet } from "./greet.ts";
import type { Connection } from "./new-connection.ts";
import { refuse } from "./refuse.ts";
import { route } from "./route.ts";
import type { Directory } from "./route.ts";
import type { Step } from "./greet.ts";

/** Advance a client connection using one decoded inbound protocol message. */
export function handle(directory: Directory, connection: Connection, inbound: Inbound): Step {
  const stay = (action: Action): Step => ({ connection, effects: [action] });

  if (inbound.type === "invalid") {
    return stay({ type: "refuse", id: inbound.id, code: inbound.code, message: inbound.message });
  }

  if (inbound.type === "hello") {
    if (connection.phase === "ready")
      return stay(refuse(inbound.id, ErrorCode.invalidRequest, "hello already done"));

    return greet(inbound.id, inbound.params.protocol);
  }

  if (connection.phase === "greeting")
    return stay(refuse(inbound.id, ErrorCode.invalidRequest, "hello first"));

  return stay(route(directory, inbound.id, inbound.method, inbound.params));
}
