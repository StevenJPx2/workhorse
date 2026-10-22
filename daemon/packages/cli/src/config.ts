import { basename } from "node:path";
import {
  CERTIFICATE_NAME,
  COMPATIBILITY_DATE,
  peerBinding,
  type Policy,
  rootBinding,
} from "@workhorse/protocol";
import { type Layout, peerCertificateFile } from "./layout.ts";

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

/** A peer this daemon dials, and its pinned certificate. */
export type DialedPeer = {
  readonly name: string;
  readonly address: string;
  readonly certificate: string;
};

/** Links in the config: the address to accept them on, if any, and the peers to dial. */
export type LinkConfig = {
  readonly listen: string | undefined;
  readonly dialed: readonly DialedPeer[];
};

// The peers the policy gives an address. Names and addresses were checked by the policy schema.
export function linkConfig(policy: Policy, listen: string | undefined): LinkConfig {
  const dialed = Object.entries(policy.peers ?? {}).flatMap(([name, peer]) =>
    peer.address === undefined
      ? []
      : [{ name, address: peer.address, certificate: peer.certificate }],
  );

  return { listen, dialed };
}

const quote = (text: string) => JSON.stringify(text);

// The workerd configuration: the daemon Worker on a Unix socket, raw connections to `connect`,
// and for links an HTTPS socket and one pinned TLS service per dialed peer (docs/architecture.md,
// "Remote links"). `embed` paths resolve relative to the config file, which sits beside what it
// embeds. The `connect` handler needs the "experimental" compatibility flag.
export function renderConfig(
  layout: Layout,
  roots: readonly DiskRoot[],
  links: LinkConfig,
): string {
  const services = [
    ...roots.map(
      (root) =>
        `    (name = ${quote(root.binding)}, disk = (path = ${quote(root.path)}, writable = ${root.writable})),`,
    ),
    ...links.dialed.map(
      (peer) =>
        `    (name = ${quote(peerBinding(peer.name))}, external = (address = ${quote(peer.address)}, https = (tlsOptions = (trustedCertificates = [embed ${quote(peerCertificateFile(peer.name))}]), certificateHost = ${quote(CERTIFICATE_NAME)}))),`,
    ),
  ];

  const bindings = [
    ...roots.map(
      (root) => `    (name = ${quote(root.binding)}, service = ${quote(root.binding)}),`,
    ),
    ...links.dialed.map(
      (peer) =>
        `    (name = ${quote(peerBinding(peer.name))}, service = ${quote(peerBinding(peer.name))}),`,
    ),
  ];

  const sockets = [
    `(name = "main", address = ${quote(`unix:${layout.socket}`)}, tcp = (), service = "daemon")`,
    ...(links.listen === undefined
      ? []
      : [
          `(name = "link", address = ${quote(links.listen)}, https = (tlsOptions = (keypair = (privateKey = embed ${quote(basename(layout.tlsKey))}, certificateChain = embed ${quote(basename(layout.tlsCertificate))}))), service = "daemon")`,
        ]),
  ];

  return `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "daemon", worker = .daemon),
${services.join("\n")}
  ],
  sockets = [
    ${sockets.join(",\n    ")}
  ],
);

const daemon :Workerd.Worker = (
  compatibilityDate = ${quote(COMPATIBILITY_DATE)},
  compatibilityFlags = ["experimental"],
  modules = [(name = "daemon.js", esModule = embed ${quote(basename(layout.bundle))})],
  durableObjectNamespaces = [(className = "Link", uniqueKey = "workhorse-link", preventEviction = true)],
  durableObjectStorage = (inMemory = void),
  bindings = [
    (name = "DEPLOYMENT", json = embed ${quote(basename(layout.deployment))}),
    (name = "IDENTITY", json = embed ${quote(basename(layout.identity))}),
    (name = "LOADER", workerLoader = ()),
    (name = "LINK", durableObjectNamespace = "Link"),
${bindings.join("\n")}
  ],
);
`;
}
