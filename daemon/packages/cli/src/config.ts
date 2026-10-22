import { basename } from "node:path";
import { COMPATIBILITY_DATE, type Policy, rootBinding } from "@workhorse/protocol";
import type { Layout } from "./layout.ts";

export type DiskRoot = {
  readonly binding: `fs:${string}`;
  readonly path: string;
  readonly writable: boolean;
};

// One disk directory per granted root. Paths are already resolved and vetted by `readPolicy`.
export function diskRoots(policy: Policy): readonly DiskRoot[] {
  return Object.entries(policy.apps).flatMap(([app, grants]) =>
    Object.entries(grants.fs?.roots ?? {}).map(([root, path]) => ({
      binding: rootBinding(app, root),
      path,
      writable: grants.fs?.mode === "read-write",
    })),
  );
}

const quote = (text: string) => JSON.stringify(text);

// The workerd configuration: the daemon Worker on a Unix socket, raw connections to `connect`.
// `embed` paths resolve relative to the config file, which sits beside what it embeds.
// The `connect` handler needs the "experimental" compatibility flag.
export function renderConfig(layout: Layout, roots: readonly DiskRoot[]): string {
  const services = roots.map(
    (root) =>
      `    (name = ${quote(root.binding)}, disk = (path = ${quote(root.path)}, writable = ${root.writable})),`,
  );

  const bindings = roots.map(
    (root) => `    (name = ${quote(root.binding)}, service = ${quote(root.binding)}),`,
  );

  return `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "daemon", worker = .daemon),
${services.join("\n")}
  ],
  sockets = [(name = "main", address = ${quote(`unix:${layout.socket}`)}, tcp = (), service = "daemon")],
);

const daemon :Workerd.Worker = (
  compatibilityDate = ${quote(COMPATIBILITY_DATE)},
  compatibilityFlags = ["experimental"],
  modules = [(name = "daemon.js", esModule = embed ${quote(basename(layout.bundle))})],
  bindings = [
    (name = "DEPLOYMENT", json = embed ${quote(basename(layout.deployment))}),
    (name = "LOADER", workerLoader = ()),
${bindings.join("\n")}
  ],
);
`;
}
