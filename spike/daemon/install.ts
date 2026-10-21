// Spike 4: generate what `workhorse install` would, from one set of grants.
// Usage: bun install.ts <base> [--no-sandbox]
import { cpSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [baseArg, flag] = process.argv.slice(2);
if (baseArg === undefined) throw new Error("usage: bun install.ts <base> [--no-sandbox]");
mkdirSync(baseArg, { recursive: true });
const base = realpathSync(baseArg); // Seatbelt matches resolved paths (/private/var, not /var).
const sandboxed = flag !== "--no-sandbox";
const label = "dev.workhorse.spike4";

const dirs = {
  bin: join(base, "bin"),
  etc: join(base, "etc"),
  state: join(base, "state"),
  sock: join(base, "sock"),
  root: join(base, "roots", "notes"),
  outside: join(base, "outside"),
  log: join(base, "log"),
};
for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });

const platformPackage = `@cloudflare/workerd-${process.platform}-${process.arch === "x64" ? "64" : process.arch}`;
const workerdSource = join(import.meta.dir, "node_modules", platformPackage, "bin", "workerd");
const workerd = join(dirs.bin, "workerd");
cpSync(workerdSource, workerd);
cpSync(join(import.meta.dir, "src", "daemon.js"), join(dirs.etc, "daemon.js"));
cpSync(join(import.meta.dir, "dist", "app.js"), join(dirs.etc, "app.js"));

const socket = join(dirs.sock, "daemon.sock");
const config = join(dirs.etc, "config.capnp");
writeFileSync(
  config,
  `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "daemon", worker = .daemon),
    (name = "root", disk = (path = "${dirs.root}", writable = true)),
    (name = "storage", disk = (path = "${dirs.state}", writable = true)),
    (name = "host-socket", external = (address = "unix:${join(dirs.outside, "host.sock")}", http = ())),
    (name = "internet", network = (allow = ["public"], tlsOptions = (trustBrowserCas = true))),
  ],
  sockets = [(name = "main", address = "unix:${socket}", http = (), service = "daemon")],
);

const daemon :Workerd.Worker = (
  compatibilityDate = "2026-10-01",
  modules = [
    (name = "daemon.js", esModule = embed "daemon.js"),
    (name = "app-source", text = embed "app.js"),
  ],
  durableObjectNamespaces = [(className = "Counter", uniqueKey = "spike4-counter", enableSql = true)],
  durableObjectStorage = (localDisk = "storage"),
  bindings = [
    (name = "ROOT", service = "root"),
    (name = "HOST_SOCKET", service = "host-socket"),
    (name = "COUNTER", durableObjectNamespace = "Counter"),
    (name = "LOADER", workerLoader = ()),
  ],
);
`,
);

const serve = [workerd, "serve", config, "--experimental"];
const command = sandboxed ? sandboxCommand(serve) : serve;
const service = writeService(command);
console.log(JSON.stringify({ base, socket, sandboxed, command, service }, null, 2));

function sandboxCommand(inner: string[]): string[] {
  if (process.platform === "darwin") {
    const profile = join(dirs.etc, "sandbox.sb");
    writeFileSync(profile, seatbelt());
    return ["/usr/bin/sandbox-exec", "-f", profile, ...inner];
  }
  return bubblewrap(inner);
}

// macOS: deny by default. Grants: the binary and its config (read), the storage, socket,
// and fs roots (read-write), system libraries, outbound IP, and only our own Unix socket.
function seatbelt(): string {
  const q = (path: string) => JSON.stringify(path);
  return `(version 1)
(deny default)

(allow process-exec (literal ${q(workerd)}))
(allow file-read* (literal ${q(workerd)}) (subpath ${q(dirs.etc)}))
(allow file-read* file-write* (subpath ${q(dirs.state)}) (subpath ${q(dirs.sock)}) (subpath ${q(dirs.root)}))

; dyld, system libraries, and devices workerd opens at startup.
(allow file-read* (subpath "/usr/lib") (subpath "/System/Library") (subpath "/System/Volumes/Preboot/Cryptexes")
  (subpath "/private/var/db/dyld") (literal "/dev/urandom") (literal "/dev/random") (literal "/private/etc/ssl/cert.pem"))
(allow file-read* file-write-data (literal "/dev/null"))
(allow file-read-metadata)
; KJ opens "/" as a directory handle at startup and aborts without it. Lists top-level names only.
(allow file-read-data (literal "/"))

(allow sysctl-read)
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration")
  (global-name "com.apple.SystemConfiguration.configd")
  (global-name "com.apple.trustd.agent")
  (global-name "com.apple.SecurityServer"))

; Network: outbound IP; Unix sockets only in our socket folder, plus the DNS resolver.
(allow network-outbound (remote ip))
(allow network-bind network-inbound (local unix-socket (subpath ${q(dirs.sock)})))
(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))
`;
}

// Linux: a private mount namespace holding only the grants, so host sockets do not exist.
// SYSTEM_RO (colon-separated) narrows the read-only system mounts, e.g. to one glibc store path.
function bubblewrap(inner: string[]): string[] {
  const system = process.env.SYSTEM_RO?.split(":") ?? ["/nix/store", "/usr", "/lib", "/lib64", "/bin", "/etc/ssl", "/etc/static/ssl", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/run/current-system/sw"];
  return [
    process.env.BWRAP ?? "bwrap",
    "--die-with-parent",
    "--unshare-all",
    "--share-net",
    "--new-session",
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    ...system.flatMap((path) => ["--ro-bind-try", path, path]),
    "--ro-bind", dirs.bin, dirs.bin,
    "--ro-bind", dirs.etc, dirs.etc,
    "--bind", dirs.state, dirs.state,
    "--bind", dirs.sock, dirs.sock,
    "--bind", dirs.root, dirs.root,
    ...inner,
  ];
}

function writeService(command: string[]): string {
  if (process.platform === "darwin") {
    const plist = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
    // workerd does not unlink a stale socket file, so a crash leaves bind() failing with
    // EADDRINUSE forever. launchd runs one instance, so removing it before exec is safe.
    const unlinkThenExec = ["/bin/sh", "-c", 'rm -f "$0"; exec "$@"', socket, ...command];
    const args = unlinkThenExec.map((arg) => `    <string>${arg}</string>`).join("\n");
    writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key><string>${dirs.etc}</string>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>1</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${join(dirs.log, "out.log")}</string>
  <key>StandardErrorPath</key><string>${join(dirs.log, "err.log")}</string>
</dict>
</plist>
`,
    );
    return plist;
  }
  // systemd owns the listening socket and passes it as fd 3, so no stale socket file
  // survives a crash and connections queue while the daemon restarts.
  const unitDir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(unitDir, { recursive: true });
  writeFileSync(
    join(unitDir, "workhorse-spike4.socket"),
    `[Socket]
ListenStream=${socket}

[Install]
WantedBy=sockets.target
`,
  );
  const unit = join(unitDir, "workhorse-spike4.service");
  writeFileSync(
    unit,
    `[Unit]
Description=Workhorse spike 4 daemon
Requires=workhorse-spike4.socket

[Service]
WorkingDirectory=${dirs.etc}
ExecStart=${[...command, "--socket-fd", "main=3"].join(" ")}
Restart=always
RestartSec=0
`,
  );
  return unit;
}
