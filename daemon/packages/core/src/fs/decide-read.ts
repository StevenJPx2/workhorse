import type { FsGrant } from "@workhorse/protocol";
import { MAX_PATH_LENGTH } from "./limits.ts";

/** Result of checking a requested path against a filesystem grant. */
export type ReadDecision =
  | { readonly type: "allowed"; readonly root: string; readonly segments: readonly string[] }
  | { readonly type: "denied"; readonly reason: "no_grant" | "outside_root" }
  | { readonly type: "invalid_path" };

/** Decide whether a relative path is authorized by a named filesystem root grant. */
export function decideRead(grant: FsGrant | undefined, root: string, path: string): ReadDecision {
  // hasOwn: a root named "constructor" or "__proto__" must not reach Object.prototype.
  if (grant === undefined || !Object.hasOwn(grant.roots, root))
    return { type: "denied", reason: "no_grant" };

  if (path.length === 0 || path.length > MAX_PATH_LENGTH || path.includes("\0"))
    return { type: "invalid_path" };
  const segments = path.split("/");

  if (path.startsWith("/") || segments.includes(".."))
    return { type: "denied", reason: "outside_root" };

  if (segments.some((segment) => segment === "" || segment === "."))
    return { type: "invalid_path" };

  return { type: "allowed", root, segments };
}
