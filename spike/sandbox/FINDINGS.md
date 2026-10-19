# Spike 1: bridge self-sandboxing with `nono` 0.80.0

The spike's code is in commit `698c2b27` (`git show 698c2b27:spike/sandbox/src/main.rs`).

Evidence, not production design. Question: can the bridge sandbox **itself** at startup with
`nono` so that it, and every child it launches, is confined to the policy's union of grants:
read roots, read-write roots, state dir, socket dir, and network denied or loopback-only?

## Verdict

**Partly.** The filesystem part works on both platforms. On macOS (Seatbelt) and Linux
(Landlock V6), `nono` confines the process to the granted read and read-write roots. The
restriction is irreversible: a second, wider apply cannot widen it. Children inherit it, as
shown with `cat` and a re-exec of the probe itself. Network "fully denied" holds only
partly on Linux. `Sandbox::apply_auto` uses Landlock alone, and Landlock covers TCP only,
so UDP egress still worked (a real DNS reply from 1.1.1.1:53). Switching to
`Sandbox::apply_seccomp(.., SeccompOpts::network_baseline())` closed that hole. On Linux,
nothing closes the remaining gap: **pathname Unix sockets outside the grant stay
connectable**. Kernel 6.12's Landlock doesn't mediate them, and nono's AF_UNIX mediation
needs a separate supervisor process to service a seccomp-notify fd, so a process cannot
provide it for itself. On NixOS this let the sandboxed probe resolve DNS through
`/var/run/nscd/socket`. Loopback-only mode is not loopback-only on Linux: grants are port
only, so a connect to 1.1.1.1 on the granted port left the host. On macOS, loopback-only
mode allows bind/listen on any port. Requirements that hold on both platforms: deny-all
networking with `network_baseline` on Linux, and filesystem confinement inherited by
children. To meet the design on Linux, the bridge's local IPC and host-socket exposure
need another layer, such as a mount namespace or a supervisor.

## nono API (as used)

```rust
use nono::{AccessMode, CapabilitySet, Sandbox, UnixSocketMode};

let caps = CapabilitySet::new()
    .allow_path(&ro_dir, AccessMode::Read)?            // dir, recursive; canonicalized; must exist
    .allow_path(&rw_dir, AccessMode::ReadWrite)?
    .allow_file(&exe, AccessMode::Read)?               // single file
    .allow_file("/dev/null", AccessMode::ReadWrite)?   // Command::output() opens it for stdin
    .allow_unix_socket_dir(&rw_dir, UnixSocketMode::ConnectBind)?  // needed on macOS
    .block_network()                                   // NetworkMode::Blocked
    .block_dns();                                      // macOS: drop the implicit mDNSResponder grant
let caps = caps.allow_localhost_port(port);            // "loopback" mode: TCP connect+bind on one port

Sandbox::support_info();    // SupportInfo { is_supported, platform, details }
nono::detect_abi()?;        // Linux only: DetectedAbi, e.g. "Landlock V6", .feature_names()

Sandbox::apply_auto(&caps)?;  // macOS -> (); Linux -> SeccompNetFallback (None on ABI >= 4)
Sandbox::apply_seccomp(&caps, nono::SeccompOpts::network_baseline())?;  // Linux: + static seccomp socket filter
```

Notes from the source (`nono-0.80.0/src/sandbox/{macos,linux}.rs`, `src/capability.rs`):

- macOS writes a `(deny default)` Seatbelt profile and calls `sandbox_init`. It always
  emits `(allow process-exec*)` and `(allow process-fork)`, so children must be able to
  read their own binary and dyld paths. The caller grants those.
- On Linux, `apply_auto` installs seccomp only when Landlock has no network support
  (ABI < 4). `SeccompOpts::network_baseline()` adds a static filter that denies UDP, raw
  sockets, non-IP families and `io_uring_setup`. With block-network it denies every
  non-Unix socket.
- The `allow_tcp_connect` and `allow_tcp_bind` per-port rules are Linux only and return an
  error on macOS.
- On Linux, pathname AF_UNIX enforcement comes only from the implied filesystem grant. Real
  mediation, `install_seccomp_af_unix_filter()`, returns a notify fd that "the supervisor
  must poll" in another process.

## Commands run

```bash
# macOS 15.7.4 arm64, rustc 1.96.0
cd spike/sandbox && cargo fetch && cargo build --release      # clean build 50.7 s
./target/release/sandbox-probe                                # network denied
./target/release/sandbox-probe --net loopback                 # + allow_localhost_port(listener)
./target/release/sandbox-probe --keep-dns                     # omit block_dns()
cargo tree | wc -l ; cargo tree -e normal --prefix none | sort -u | wc -l

# Linux: steven@192.168.0.40, NixOS, 6.12.82 x86_64, rustc 1.98.1; source scp'd to /tmp/sbp-spike
CARGO_HOME=/tmp/sbp-spike/.cargo-home nix-shell -p cargo rustc gcc --run 'cargo build --release'  # 14m29s
./target/release/sandbox-probe
./target/release/sandbox-probe --linux-apply baseline
./target/release/sandbox-probe --net loopback --linux-apply baseline
nix-shell -p strace --run 'strace -f -e trace=connect,socket ./target/release/sandbox-probe --linux-apply baseline'

# Linux in Docker on OrbStack (kernel 7.2.9-orbstack, arm64, default Docker seccomp profile)
docker run --rm -v "$PWD":/src:ro rust:latest sh -c '... cargo build --release; ./target/release/sandbox-probe; ./target/release/sandbox-probe --linux-apply baseline'
```

Afterwards I deleted every `/tmp/sbp-*` and `/tmp/sbp-spike` directory on both hosts.

## Results: network denied

Fixture: `/tmp/sbp-<pid>/{granted-ro,granted-rw,outside}`. Policy: ro + rw, the probe's own
binary, `/dev/null`, system read paths (`/bin /usr /lib /System /nix/store …`, never home or
`/tmp`), `block_network().block_dns()`. All listeners and sockets were created before
applying. Pre-sandbox checks passed everywhere: the outside file and home file were readable,
`tcp 1.1.1.1:443` connected, and UDP DNS got `reply 61 bytes`.

Cells show the observed `actual`. ✗ marks a result that differs from `expected`.

| Probe | expected | macOS Seatbelt | Linux `apply_auto` | Linux `network_baseline` | Docker `apply_auto` / `baseline` |
|---|---|---|---|---|---|
| read granted-ro | allow | allow | allow | allow | allow / allow |
| write granted-ro | deny | deny (EPERM) | deny (EACCES) | deny | deny / deny |
| write granted-rw | allow | allow | allow | allow | allow / allow |
| read outside sibling | deny | deny | deny | deny | deny / deny |
| read home file¹ | deny | deny | deny | deny | deny / deny |
| TCP 1.1.1.1:443 | deny | deny | deny (EACCES, Landlock) | deny (EPERM, seccomp) | deny / deny |
| UDP DNS 1.1.1.1:53 | deny | deny | **allow ✗** `reply 61 bytes` | deny | **allow ✗** / deny |
| getaddrinfo example.com | deny | deny | **allow ✗** | **allow ✗** (via nscd) | deny² / deny² |
| TCP loopback listener (pre-created) | deny | deny | deny | deny | deny / deny |
| TCP own LAN IP, same port | deny | deny | deny | deny | deny / deny |
| TCP 1.1.1.1, listener's port | deny | deny | deny | deny | deny / deny |
| TCP bind 127.0.0.1:0 | deny | deny | deny | deny | deny / deny |
| Unix connect, socket in granted-rw | allow | allow | allow | allow | allow / allow |
| Unix bind, new socket in granted-rw | allow | allow | allow | allow | allow / allow |
| Unix connect, socket in outside | deny | deny | **allow ✗** | **allow ✗** | **allow ✗** / **allow ✗** |
| child `cat` granted-ro (control) | allow | allow | allow | allow | allow / – |
| child `cat` outside | deny | deny | deny | deny | deny / – |
| child self-exec reads granted-ro (control) | allow | allow | allow | allow | allow / – |
| child self-exec reads outside | deny | deny | deny | deny | deny / – |
| re-apply wider, then read outside | deny | deny | deny | deny | deny / – |
| re-apply wider, then TCP 1.1.1.1:443 | deny | deny | deny | deny | deny / – |
| exit status | 0 | **0** | 1 (3 failures) | 1 (2 failures) | 1 (2) / 1 (1) |

¹ `~/.ssh/known_hosts` on macOS, `~/.ssh/authorized_keys` on the server, `/root/.bashrc` in Docker.
² Failed because `/etc/resolv.conf` was unreadable, not because of network policy. UDP was
still open under `apply_auto`.

Re-apply behaviour as reported by the probe:

```text
macOS:  sandbox initialization failed: Operation not permitted
        INFO reapply_wider(allow / rw, network allowed)=Err(Sandbox initialization failed: Operation not permitted)
Linux:  INFO reapply_wider(allow / rw, network allowed)=Ok(landlock(apply_auto) seccomp_fallback=None)
        PROBE reapply-wider-read-outside expected=deny actual=deny detail=PermissionDenied/osSome(13): Permission denied (os error 13)
```

macOS refuses a second `sandbox_init`. Linux accepts it and stacks a new Landlock layer,
which can only intersect. Neither platform widened access.

How nscd defeated "network denied" on Linux, from strace under `network_baseline`:

```text
socket(AF_UNIX, SOCK_STREAM|SOCK_CLOEXEC|SOCK_NONBLOCK, 0) = 6
connect(6, {sa_family=AF_UNIX, sun_path="/var/run/nscd/socket"}, 110) = 0
socket(AF_INET, SOCK_DGRAM|SOCK_CLOEXEC, IPPROTO_IP) = -1 EPERM (Operation not permitted)
PROBE dns-resolve-example.com expected=deny actual=allow detail=resolved Some([2606:4700:10::6814:179a]:443)
```

## Results: loopback mode (`block_network()` + `allow_localhost_port(listener_port)`)

| Probe | desired | macOS | Linux `network_baseline` |
|---|---|---|---|
| TCP 1.1.1.1:443 | deny | deny | deny |
| TCP loopback listener | allow | allow | allow |
| TCP own LAN IP, same port | deny | **allow** | **allow** |
| TCP 1.1.1.1, same port | deny | deny | **allow** `not blocked by sandbox, network said TimedOut` |
| TCP bind 127.0.0.1:0 | deny | **allow** | deny |
| UDP DNS | deny | deny | deny |

## Limits found

| Area | macOS (Seatbelt) | Linux (Landlock V6, kernel 6.12) |
|---|---|---|
| Network deny | All of TCP, UDP and Unix denied except explicit socket grants | `apply_auto`: TCP only, UDP open. `network_baseline`: all non-Unix sockets denied |
| Loopback-only | Outbound limited to `localhost:PORT`, which also matched the host's own LAN IP. Bind/inbound allowed on any port | Port only. Connects to any host on that port. Bind limited per port |
| Hostname filtering | None (needs nono-proxy) | None |
| Pathname Unix sockets | Mediated per path. Needs `allow_unix_socket_dir`; a filesystem grant alone doesn't permit `connect` | **Not mediated.** Any reachable host socket (nscd, D-Bus, container sockets) can be connected. Fixing it needs a seccomp-notify supervisor in another process |
| Inheritance | Yes: `cat` and self re-exec denied outside | Yes: same |
| Re-apply | Second apply returns `Err`; no change | Second apply returns `Ok`, stacks and intersects; no widening |
| Detection | `support_info()`: "macOS Seatbelt sandbox available" | `detect_abi()`: "Landlock V6" (Refer, Truncate, TCP, IoctlDev, scoping) |
| Children's needs | Caller must grant the binary, dyld/system paths and `/dev/null` | Caller must grant the binary, `/nix/store` or `/usr` and so on, and `/dev/null` |
| Apply time | 6.1–21.9 ms over 11 runs | 162–195 µs (`apply_auto`), 284–350 µs (`baseline`) |
| Containers | – | Landlock V6 and seccomp both worked inside an OrbStack Docker container |

## Dependency weight

| Measure | Value |
|---|---|
| `cargo tree \| wc -l` | 378 (366 with `default-features = false`) |
| Unique normal-dependency crates | 171 (166 without the default `system-keyring` feature) |
| Release binary | macOS arm64: 1,361,776 B. Linux x86_64: 970,336 B |
| Clean release build | macOS: 50.7 s. Homelab server: 14m29s |

The weight comes from non-optional modules unrelated to sandboxing: `trust`, which pulls in
`sigstore-verify` → `rustls-webpki`/`aws-lc-rs` → **`aws-lc-sys`** (C/asm build), plus
`keystore` (`keyring`, a default feature), `undo`, `audit` and `globset`/`ignore`. The linker
strips most of it, but compile time and supply-chain surface remain.

## Surprises

- Linux `Sandbox::apply_auto` with `block_network()` does not stop UDP on Landlock ≥ V4
  kernels. The stronger mode is opt-in through `apply_seccomp(.., network_baseline())`.
- "Network denied" on Linux can be bypassed through any host daemon with a Unix socket. On
  NixOS, glibc's nscd client did name resolution for the sandboxed process.
- On macOS, `block_dns()` matters: without it the profile allows `mDNSResponder`. In this
  policy getaddrinfo still failed with `--keep-dns`, probably because no `/etc` paths were
  granted. I did not investigate further.
- `Command::output()` fails with `EPERM` at spawn unless `/dev/null` is granted (stdin
  defaults to null).
- On NixOS, a canonicalized `cat` path resolves to the coreutils multicall binary, which
  dispatches on argv[0]. Exec the symlink path instead.
- The probe's own `remove_dir_all` cleanup always fails after sandboxing (granted-ro and
  outside are not writable), so fixtures have to be deleted from outside the sandbox.
- Even the narrowest nono build compiles a C crypto library (`aws-lc-sys`) for a sandboxing
  primitive.

## Contradictions to the design assumptions

1. "Network denied" is achievable on Linux only with `network_baseline`, and even then only
   for IP sockets. Unix-socket egress to host daemons stays open.
2. Loopback-only cannot be expressed on Linux. Landlock grants by port only, and the port is
   reachable on every host. Treat it as unavailable, or enforce it with a network namespace.
3. On Linux, "the directory holding its Unix socket" as the only reachable socket is not
   enforceable by a self-applied sandbox. Every other pathname socket on the host is
   reachable too.
4. A wider re-apply behaves differently per platform (`Err` on macOS, `Ok` on Linux), but
   both are safe. Callers must not read `Ok` as "the policy is now wider".
