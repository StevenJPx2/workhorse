import { ErrorCode } from "@workhorse/protocol/constants";
import type { Json, RequestId } from "@workhorse/protocol";
import { type Apps, deny, type LocalAction } from "../connection/index.ts";
import { refuse } from "../connection/refuse.ts";

/**
 * A call from a paired peer. It may call only the operations its policy entry lists, and only
 * apps on this daemon: a call that arrived over a link is never routed on to another peer. The
 * grant is checked first, so an unlisted method reveals nothing about what is installed.
 */
export function routePeerCall(
  apps: Apps,
  grants: ReadonlySet<string>,
  id: RequestId,
  method: string,
  params: Json | undefined,
): LocalAction {
  if (!grants.has(method)) return deny(id, method, "no_grant");
  const dot = method.indexOf(".");
  const app = method.slice(0, dot);
  const operation = method.slice(dot + 1);

  if (dot <= 0 || apps.get(app)?.has(operation) !== true)
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  return { type: "call_app", id, app, operation, params };
}
