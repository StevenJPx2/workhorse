import { ErrorCode } from "@workhorse/protocol/constants";
import type { Json, RequestId } from "@workhorse/protocol";
import type { Action } from "./action.ts";
import { deny } from "./deny.ts";
import { refuse } from "./refuse.ts";

/** Public operations declared by loaded apps. */
export type Apps = ReadonlyMap<string, ReadonlySet<string>>;

const OUTSIDE_WORLD: ReadonlySet<string> = new Set(["fs", "net"]);

/** Resolve a method to an app operation while keeping outside-world capabilities private. */
export function route(apps: Apps, id: RequestId, method: string, params: Json | undefined): Action {
  const dot = method.indexOf(".");
  const owner = method.slice(0, dot);
  const operation = method.slice(dot + 1);

  if (dot <= 0 || operation === "")
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  if (OUTSIDE_WORLD.has(owner)) return deny(id, method, "no_grant");

  if (apps.get(owner)?.has(operation) !== true)
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  return { type: "call_app", id, app: owner, operation, params };
}
