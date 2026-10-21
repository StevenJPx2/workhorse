# Spike 4: a workerd-only daemon under the OS sandbox and service manager

**Verdict: the shape holds on both platforms.** workerd listens on a Unix socket under `sandbox-exec` (macOS, launchd) and bubblewrap (NixOS, `systemd --user`). It serves files through disk directories, runs an MCP app as a Dynamic Worker, and restarts in under 100 ms. Every escape the design worried about succeeds without the sandbox and is blocked with it. Three findings change the design: the per-app memory budget cannot be met with the MCP SDK inside each app, the stdio relay must understand MCP's 2026 HTTP headers and should not be a Bun process, and workerd on Linux x86_64 misses the idle-RSS and cold-start budgets with or without the sandbox.

## What was built

| File | What it is |
|---|---|
| `src/daemon.js` | The daemon Worker: `/fs/*` through a writable disk directory, `/host-socket` (an `external` service to a Unix socket outside the grants), `/net` (`fetch` to example.com), `/counter` (Durable Object SQLite on local disk), `/mcp/notes` (a Dynamic Worker app), `/tiny/*` (trivial Dynamic Workers, for memory) |
| `src/app.ts` | The app: `createMcpHandler` from `@modelcontextprotocol/server` 2.3.1 with one `read` tool backed by an `Fs` capability from `ctx.exports`, `globalOutbound: null`. Bundled to 290,571 B (74,271 B gzip) |
| `install.ts` | What `workhorse install` would do: copy workerd, write `config.capnp`, the Seatbelt profile or bubblewrap command, and the launchd plist or systemd units, all from one set of directories |
| `probe.ts` | 13 black-box checks from outside the sandbox, including the MCP SDK client over HTTP on the Unix socket in both protocol eras |
| `service.sh` | Starts the daemon through the service manager, probes it, times SIGKILL and controlled restarts, and on Linux inspects the sandbox's filesystem view through `/proc/<pid>/root` |
| `relay.ts`, `relay-probe.ts` | `workhorse mcp <app>`: stdio to HTTP over the Unix socket, driven by the SDK's `StdioClientTransport` |

The spike's code is in the commit that added this file.

Versions: workerd 1.20261019.1, MCP SDK 2.3.1 (`@modelcontextprotocol/client` and `server`), zod 4.2.1, Bun 1.4.3 (macOS) and 1.4.2 (NixOS), bubblewrap 0.12.0. Hosts: macOS 15.7.4 arm64 (M1 Max); NixOS 26.11, kernel 6.12.82 x86_64 (`steven@192.168.0.40`).

## Results

Each check ran in three modes: no sandbox (baseline, expected to leak), sandbox in the foreground, and sandbox under the service manager. The service runs repeated the probe after the restarts.

| Check | No sandbox (both) | macOS `sandbox-exec` + launchd | NixOS bubblewrap + `systemd --user` |
|---|---|---|---|
| Read a file in the root | allow | allow | allow |
| Write a file in the root | allow | allow | allow |
| Read a symlink in the root pointing to a file outside | **allow** (`top secret`) | deny (500; Seatbelt `deny file-read-data …/outside/secret.txt`) | deny (500; `No such file or directory`) |
| Read through a symlinked directory | **allow** | deny | deny |
| Write through a symlinked directory | **allow** (file created outside) | deny (`deny file-write-create …/outside/.written.txt.…tmp`) | deny (`File exists`: the link dangles inside) |
| `..` in the path | deny (normalized away before the disk) | deny | deny |
| Connect to a host Unix socket outside the grants | **allow** | deny (`deny network-outbound …/outside/host.sock`) | deny (the path does not exist) |
| Outbound HTTPS to example.com | allow | allow | allow |
| Durable Object SQLite on local disk | allow | allow | allow |
| MCP over HTTP, 2025 era: `tools/list`, read a note | allow | allow | allow |
| MCP over HTTP, 2026 era (`server/discover`): same | allow | allow | allow |
| MCP tool reading the symlink escape | **allow** | deny (`isError`) | deny |
| Exit | ALL PASS (13) | ALL PASS (13), again after restarts | ALL PASS (13), again after restarts |

Linux filesystem view of the running daemon, read from the host through `/proc/<pid>/root`:

```
inside sandbox: /run/nscd/socket absent (on host: exists)
inside sandbox: /var/run/nscd/socket absent (on host: exists)
inside sandbox: /run/user/1000/bus absent (on host: exists)
inside sandbox: /home absent (on host: exists)
inside sandbox: /tmp/wh-spike4/run-svc/outside absent (on host: exists)
```

This closes spike 1's Linux gap: the `nscd` socket that let a self-sandboxed process resolve names does not exist inside the mount namespace, and DNS still works through `/etc/resolv.conf`.

## Measurements

| Measure | macOS arm64 | NixOS x86_64 |
|---|---|---|
| Cold start to first `/health`, no sandbox | 27–43 ms (first run 170 ms) | 51–60 ms |
| Cold start, sandboxed | 44–61 ms (Seatbelt adds about 10 ms) | 54–55 ms (bubblewrap adds nothing measurable) |
| First start of a freshly copied binary through launchd | 1.3 s (one-off, presumably the first-exec security scan) | 490 ms through socket activation |
| Warm start through `launchctl bootstrap` | 94–137 ms | — |
| Restart after SIGKILL | 92–108 ms (after the throttle fix) | 74–95 ms |
| Controlled restart (`kickstart -k` / `systemctl restart`) | 1,172 ms (1 s throttle) | 80–99 ms |
| workerd SIGTERM to exit | 24 ms | — |
| Idle RSS | 30–33 MB | 48–50 MB, sandboxed or not |
| RSS after the 13-check probe | 73–75 MB | 90 MB |
| First MCP SDK app loaded | +28–29 MB (30 → 59 MB, 3 rounds) | — |
| 50 more MCP calls | +7–8 MB | — |
| One trivial Dynamic Worker | +3 MB first, then 1.96 MB each (51 loaded: 131 MB) | — |
| stdio relay (Bun script / `bun build --compile`), after 200 calls | 24.2–24.8 MB / 23.3–23.6 MB | — |
| Compiled relay on disk | 70,862,450 B | — |
| `nc -U` byte pipe on the same socket | 2.5 MB | — |

## Findings that change or constrain the design

| Finding | Consequence |
|---|---|
| Loading one app that runs the MCP SDK and zod costs about **29 MB**; a trivial Dynamic Worker costs about **2 MB** | The "≤ 2 MB per loaded app" budget is met by the isolate alone and missed about 14× when each app carries the SDK. The MCP framework (slice 10) should terminate MCP once in the daemon and call app tools over Workers RPC, or apps must use a far smaller MCP layer |
| MCP 2026-07-28 Streamable HTTP **requires** `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers mirroring the body (and `Mcp-Param-*` for marked tool parameters), and rejects mismatches with `400 HeaderMismatch` | A relay that pipes bytes into HTTP drops 2026 clients back to the 2025 era. The relay must parse messages and mirror headers (done here for the three required headers; `Mcp-Param-*` and Base64 encoding were not) |
| The spec says custom transports over Unix sockets **should** reuse the stdio framing: newline-delimited JSON-RPC | If the daemon also serves MCP as NDJSON on a socket, the relay becomes a byte pipe with no MCP knowledge (`nc -U` measured 2.5 MB). This matches the daemon's own wire format |
| A Bun relay costs **24 MB per process**, and a stdio-only host runs one per session per app | The relay must not be a Bun process. A native relay or a byte pipe is needed to stay near the per-session budget |
| workerd **does not remove a stale Unix socket file**: after a crash every restart fails with `bind(): Address already in use`, and launchd retries forever | macOS: the service runs `rm -f <socket>` then `exec`s the sandbox (safe because launchd runs one instance). Linux: systemd socket activation owns the socket and passes it as `--socket-fd main=3`; no stale file, and connections queue during restarts |
| launchd throttles respawns to **one per 10 s** by default; a SIGKILL soon after start took 7.1 s to recover and `kickstart -k` took 10.1 s | Set `ThrottleInterval` (1 s here: crash recovery 92–108 ms). systemd with `RestartSec=0` hit its start limit (5 in 10 s) during a crash loop; tune `StartLimitBurst`/`StartLimitIntervalSec` deliberately |
| workerd opens **`/`** and its **working directory** as directory handles at startup and aborts (exit 134) without them | The Seatbelt profile allows `file-read-data` on exactly `/` (lists top-level names only); the service sets `WorkingDirectory` to the config folder |
| Escapes blocked by the OS sandbox surface as an opaque **500 / "internal error"** from the disk service | The daemon cannot tell a sandbox denial from another failure. `fs` must check paths in `core` (and report `denied`) before the disk; the OS sandbox stays the backstop |
| On Linux, workerd **requires system CA certificates** to start even with `trustBrowserCas`, and loads glibc only | Minimal bubblewrap mounts: the glibc store path, `/etc/resolv.conf`, and `/etc/ssl/certs/ca-certificates.crt` (bubblewrap binds the resolved target of NixOS's symlink chain). The whole `/nix/store` is not needed |
| The npm workerd binary **cannot run on NixOS** as shipped (generic `/lib64` loader) and nixpkgs has no workerd | `workhorse install` must patch the interpreter and rpath to the store's glibc (`patchelf`), rely on `nix-ld`, or ship a Nix package |
| `systemd --user` on the homelab has **lingering off** | User services stop at logout. A home-server install must enable lingering (`loginctl enable-linger` or NixOS `users.users.<name>.linger`) |
| workerd on Linux x86_64 idles at **48–50 MB** and cold-starts in **51–60 ms**, sandboxed or not | Both exceed the budgets (≤ 40 MB, ≤ 50 ms), which were set from macOS. Budgets need per-platform evidence, measured on the CI runner's hardware |
| Seatbelt denied timezone data, ICU data, a networkd preference and an `AF_SYSTEM` socket without breaking any check | Record as known denials; allow them only when a feature needs them |
| `(allow file-read-metadata)` is unrestricted in the profile | It exposes `stat` on any path, not contents. Narrowing it to ancestors of the grants was not attempted |

## Seatbelt profile used (macOS)

```scheme
(version 1)
(deny default)
(allow process-exec (literal "<base>/bin/workerd"))
(allow file-read* (literal "<base>/bin/workerd") (subpath "<base>/etc"))
(allow file-read* file-write* (subpath "<base>/state") (subpath "<base>/sock") (subpath "<root>"))
(allow file-read* (subpath "/usr/lib") (subpath "/System/Library") (subpath "/System/Volumes/Preboot/Cryptexes")
  (subpath "/private/var/db/dyld") (literal "/dev/urandom") (literal "/dev/random") (literal "/private/etc/ssl/cert.pem"))
(allow file-read* file-write-data (literal "/dev/null"))
(allow file-read-metadata)
(allow file-read-data (literal "/"))
(allow sysctl-read)
(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration") (global-name "com.apple.SystemConfiguration.configd")
  (global-name "com.apple.trustd.agent") (global-name "com.apple.SecurityServer"))
(allow network-outbound (remote ip))
(allow network-bind network-inbound (local unix-socket (subpath "<base>/sock")))
(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))
```

Paths must be the resolved ones (`/private/var/…`, not `/var/…`). Denials were read with `/usr/bin/log show --predicate 'sender == "Sandbox"'`; in zsh, plain `log` is a shell builtin.

## bubblewrap command used (NixOS)

```sh
bwrap --die-with-parent --unshare-all --share-net --new-session --dev /dev --proc /proc --tmpfs /tmp \
  --ro-bind <glibc store path> <same> --ro-bind-try /etc/resolv.conf /etc/resolv.conf \
  --ro-bind-try /etc/hosts /etc/hosts --ro-bind-try /etc/nsswitch.conf /etc/nsswitch.conf \
  --ro-bind-try /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt \
  --ro-bind <base>/bin <same> --ro-bind <base>/etc <same> \
  --bind <base>/state <same> --bind <base>/sock <same> --bind <root> <same> \
  <base>/bin/workerd serve <base>/etc/config.capnp --experimental --socket-fd main=3
```

Started by a `systemd --user` `.socket` unit (`ListenStream=<base>/sock/daemon.sock`) and a service with `Restart=always`, `RestartSec=0`, `WorkingDirectory=<base>/etc`. bubblewrap passes the inherited fd 3 through.

## Not covered

- The stdio relay on Linux, and a native relay.
- `Mcp-Param-*` headers and Base64-encoded `Mcp-Name` values in the relay.
- Memory per app on Linux, and app memory with a hand-rolled MCP layer or daemon-side MCP.
- A real agent host (OpenCode, Claude Code) attached through the relay; the SDK's own clients stood in for hosts.
- Narrowing `file-read-metadata` on macOS.
- Policy-driven regeneration and a drain before a controlled restart; restarts here were immediate.

## Cleanup

The launchd agent and plist, the systemd units, all workerd processes, `/tmp/wh-spike4` on the homelab and the local run folders were removed. The homelab's Nix store gained bun 1.4.2, bubblewrap 0.12.0, patchelf and curl's dev outputs; `nix-collect-garbage` removes them.
