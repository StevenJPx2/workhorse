import { dirname } from "node:path";
import type { DiskRoot } from "./config.ts";
import type { Layout } from "./layout.ts";

// The OS sandbox the daemon runs in (docs/architecture.md, "Sandboxing"). It grants the daemon's
// own folders and the policy's roots, nothing else on disk, and no Unix sockets but its own.

export type Sandbox =
  | { readonly type: "none" }
  | { readonly type: "seatbelt"; readonly profile: string }
  | { readonly type: "bubblewrap"; readonly bwrap: string; readonly loader: string | undefined };

export function serveArgs(layout: Layout): readonly string[] {
  return [layout.workerd, "serve", layout.config, "--experimental"];
}

export function sandboxedArgs(
  sandbox: Sandbox,
  layout: Layout,
  roots: readonly DiskRoot[],
): readonly string[] {
  if (sandbox.type === "seatbelt")
    return ["/usr/bin/sandbox-exec", "-f", sandbox.profile, ...serveArgs(layout)];

  if (sandbox.type === "bubblewrap")
    return [sandbox.bwrap, ...bubblewrapArgs(layout, roots, sandbox.loader), ...serveArgs(layout)];

  return serveArgs(layout);
}

const q = (path: string) => JSON.stringify(path);

// macOS. Denials seen in spike 4 and left denied: syslog, dtrace, ICU and timezone data.
// `listen` is the `host:port` links are accepted on; only its port may be bound.
export function seatbeltProfile(
  layout: Layout,
  roots: readonly DiskRoot[],
  listen: string | undefined,
): string {
  const rootGrants = roots.map((root) =>
    root.writable
      ? `(allow file-read* file-write* (subpath ${q(root.path)}))`
      : `(allow file-read* (subpath ${q(root.path)}))`,
  );

  const linkGrant =
    listen === undefined
      ? "; No links accepted: no TCP port may be bound."
      : `; Links: this one TCP port only.\n(allow network-bind network-inbound (local ip ${q(`*:${listen.slice(listen.lastIndexOf(":") + 1)}`)}))`;

  return `(version 1)
(deny default)

(allow process-exec (literal ${q(layout.workerd)}))
(allow file-read* (literal ${q(layout.workerd)}) (subpath ${q(layout.etc)}))
(allow file-read* file-write* (subpath ${q(layout.state)}) (subpath ${q(layout.sock)}))
${rootGrants.join("\n")}

; dyld, system libraries, entropy, and the CA bundle workerd opens at startup.
(allow file-read* (subpath "/usr/lib") (subpath "/System/Library") (subpath "/System/Volumes/Preboot/Cryptexes")
  (subpath "/private/var/db/dyld") (literal "/dev/urandom") (literal "/dev/random") (literal "/private/etc/ssl/cert.pem"))
(allow file-read* file-write-data (literal "/dev/null"))
; stat() anywhere, contents nowhere else. Narrowing this was not attempted (spike 4).
(allow file-read-metadata)
; workerd opens "/" as a directory handle at startup and aborts without it; this lists top-level names only.
(allow file-read-data (literal "/"))

(allow sysctl-read)
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration")
  (global-name "com.apple.SystemConfiguration.configd")
  (global-name "com.apple.trustd.agent")
  (global-name "com.apple.SecurityServer"))

; Outbound IP, its own socket folder, and the system DNS resolver. No other Unix sockets.
(allow network-outbound (remote ip))
(allow network-bind network-inbound (local unix-socket (subpath ${q(layout.sock)})))
(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))
${linkGrant}
`;
}

// Linux system files workerd needs: libraries, DNS, and the CA bundle (Debian and NixOS path, then
// Fedora's). Missing ones are skipped. Only the bundle file is bound, not its folder: on NixOS the
// file is a symlink into the store, binding it follows the link, and bubblewrap cannot mount onto
// a symlink inside an already-bound folder.
const LINUX_SYSTEM = [
  "/usr",
  "/lib",
  "/lib64",
  "/bin",
  "/etc/resolv.conf",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/ssl/certs/ca-certificates.crt",
  "/etc/pki/tls/certs/ca-bundle.crt",
];

// Linux: a private mount namespace containing only the grants, so host sockets such as nscd and
// docker.sock do not exist inside it. `loader` is a glibc dynamic loader outside the system paths
// (NixOS); its store folder is mounted read-only too.
export function bubblewrapArgs(
  layout: Layout,
  roots: readonly DiskRoot[],
  loader: string | undefined,
): readonly string[] {
  const system = loader === undefined ? LINUX_SYSTEM : [...LINUX_SYSTEM, dirname(dirname(loader))];

  return [
    "--die-with-parent",
    "--unshare-all",
    "--share-net",
    "--new-session",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    ...system.flatMap((path) => ["--ro-bind-try", path, path]),
    "--ro-bind",
    layout.bin,
    layout.bin,
    "--ro-bind",
    layout.etc,
    layout.etc,
    "--bind",
    layout.state,
    layout.state,
    "--bind",
    layout.sock,
    layout.sock,
    ...roots.flatMap((root) => [root.writable ? "--bind" : "--ro-bind", root.path, root.path]),
  ];
}
