import type { AppName, RootName } from "../policy/index.ts";

/**
 * The binding name of one granted root's disk directory. Names cannot contain ":", so the
 * result is unambiguous.
 */
export function rootBinding(app: AppName, root: RootName): `fs:${string}` {
  return `fs:${app}:${root}`;
}
