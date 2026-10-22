import { ErrorCode } from "@workhorse/protocol/constants";
import type { Json, RequestId } from "@workhorse/protocol";
import type { Action } from "./action.ts";
import { deny } from "./deny.ts";
import { refuse } from "./refuse.ts";

/** Public operations declared by loaded apps. */
export type Apps = ReadonlyMap<string, ReadonlySet<string>>;

/** Where each app is served: its public operations here, or the peer `routes` sends it to. */
export type Directory = { readonly apps: Apps; readonly routes: ReadonlyMap<string, string> };

const OUTSIDE_WORLD: ReadonlySet<string> = new Set(["fs", "net"]);

// `link.*` exists only on links between daemons, never for local clients.
const LINK_ONLY = "link";

/**
 * Resolve a local client's method: an app here, an app on a peer, or nothing. Outside-world
 * capabilities stay private: a local client holds no grant for them.
 */
export function route(
  directory: Directory,
  id: RequestId,
  method: string,
  params: Json | undefined,
): Action {
  const dot = method.indexOf(".");
  const owner = method.slice(0, dot);
  const operation = method.slice(dot + 1);

  if (dot <= 0 || operation === "" || owner === LINK_ONLY)
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  if (OUTSIDE_WORLD.has(owner)) return deny(id, method, "no_grant");
  const peer = directory.routes.get(owner);

  if (peer !== undefined) return { type: "call_peer", id, peer, method, params };

  if (directory.apps.get(owner)?.has(operation) !== true)
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  return { type: "call_app", id, app: owner, operation, params };
}
