# Spike 2: remote transport for daemon JSON-RPC

**Question:** which transport carries newline-delimited JSON-RPC 2.0 between devices and the home server?

- **A:** WebSocket over TLS (tokio + tokio-tungstenite 0.30 + tokio-rustls 0.26 / rustls 0.23, ring).
- **B:** iroh 1.3.0 with a self-hosted `iroh-relay` 1.3.0.

**Pre-registered rule:** WebSocket is selected unless iroh restores calls after a client's network switch more than 2 seconds faster.

## Verdict

**WebSocket.** In the simulated switch, iroh recovered **780 ms faster** at the median (321 ms vs 1101 ms longest gap) and 668 ms faster at the max. That is below the 2 s threshold.

The WebSocket number is dominated by the client's 1000 ms call deadline, which was fixed before any run. TCP never surfaced an error. See [Caveats](#caveats).

## Environment

| Item | Value |
|---|---|
| Laptop (server, relay, Docker) | macOS 15.7 arm64, rustc 1.96.0, Docker 29.8.2 (OrbStack), LAN IP 192.168.0.142 |
| Homelab (LAN client) | NixOS, Linux 6.12.82 x86_64, 4 cores, rustc 1.98.1 via `nix-shell`; also runs immich, Home Assistant and others (load average ≈ 3.8 while idle from my side) |
| macOS application firewall | `socketfilterfw --getglobalstate` → `Firewall is disabled. (State = 0)` |
| LAN baseline | homelab → laptop `ping -c 5`: `rtt min/avg/max/mdev = 1.936/2.683/3.404/0.619 ms` |

## What was built

A standalone Cargo project (empty `[workspace]`) with features `ws` and `iroh` (both default), so each transport can be built and measured alone.

- `server`: echoes JSON-RPC lines. WS+TLS on `--ws-port`; iroh endpoint with ALPN `workhorse/0` on `--iroh-port`, accepting bidirectional streams that carry newline-delimited JSON. Prints EndpointId and addresses.
- `client rtt`: N sequential echo calls with a ~200-byte `params`. Reports endpoint setup, connect, first call, and p50/p95/p99/max.
- `client switch`: a call every 50 ms for T seconds, with a **1000 ms per-call deadline for both transports**. WS treats any failure, including a missed deadline, as a dead connection and reconnects immediately, retrying every 100 ms. iroh keeps its connection on a timeout and reconnects only if the connection itself has closed (`conn.close_reason().is_some()`). The client records every gap between successful replies, the longest gap, and failed in-flight calls, and logs iroh path events.
- Replies are read by a reader task into a bounded `mpsc` channel, so deadline timeouts never cancel a partial read. Late replies are matched by id and discarded.
- TLS certs: a test CA plus a server cert with `subjectAltName=DNS:workhorse.test`, generated with the `openssl` CLI (OpenSSL 4.0.3).

The spike source was removed from the repository by commit `fc07b307 chore(spike): remove spike code, keep findings` while measurements were still running. This file is the retained evidence.

### Dependencies

Approved: tokio, serde_json, tokio-tungstenite, tokio-rustls, rustls, iroh, iroh-relay (binary).

**Flagged:** `futures-util` 0.3 (`default-features = false, features = ["sink", "std"]`) is a direct dependency. It supplies `SinkExt`/`StreamExt` for `WebSocketStream` and `StreamExt` for iroh's path-event stream. It is already a transitive dependency of both tokio-tungstenite and iroh, so it adds no crates to either tree. `serde` was not needed.

### API notes (iroh 1.3, from docs.rs/context7 and crate source)

```rust
// Custom relay only, no n0 relays, no QUIC address discovery (relay runs --dev):
let mode = RelayMode::Custom(RelayMap::from(RelayConfig::new("http://192.168.0.142:3340".parse()?, None)));
let ep = Endpoint::builder(presets::Minimal)          // Minimal = crypto provider only; no pkarr/DNS lookup
    .secret_key(SecretKey::from_bytes(&[1; 32]))      // spike-only deterministic key
    .alpns(vec![b"workhorse/0".to_vec()])
    .relay_mode(mode)
    .bind_addr(("0.0.0.0", 7001))?                    // replaces the default v4 socket
    .bind().await?;

// Relay-only client (how relay path was forced; mirrors upstream test endpoint_two_relay_only_no_ip):
let ep = Endpoint::builder(presets::Minimal).relay_mode(mode).clear_ip_transports().bind().await?;
let conn = ep.connect(EndpointAddr::new(server_id).with_relay_url(relay_url), b"workhorse/0").await?;
let (send, recv) = conn.open_bi().await?;             // lazy: peer sees it on first write
for p in &conn.paths() { p.is_selected(); p.is_relay(); p.remote_addr(); }
let events = conn.path_events();                      // Opened / Closed / Selected, 'static stream
```

- **Forcing relay-only works.** With `clear_ip_transports()` the client has no IP sockets, and `conn.paths()` reports only `*relay:Relay(http://…:3340/)` as selected.
- `iroh-relay --dev` serves plain HTTP on `[::]:3340` with no QUIC address discovery. Passing `RelayConfig::new(url, None)` stops clients from probing the QAD port.
- iroh 1.x uses QUIC multipath (the `noq` fork). On LAN it opened and probed every advertised server address (including OrbStack bridge IPs 192.168.107.0 and 192.168.139.3), then closed the losers within ~15 ms.
- `iroh::endpoint::SendStream::write_all` is inherent; no `AsyncWriteExt` import is needed. `RecvStream` works with `tokio::io::BufReader::lines()`.

## Measurement 1 — LAN RTT (laptop server ↔ homelab client)

**Not measured.** The homelab client build completed once (combined build: 17 min 08 s; WS-only build: 3 min 50 s). Its directory `/tmp/wh-transport` was then deleted on the homelab by a process outside this spike, along with other sessions' `/tmp` directories.

A rebuild in `/tmp/wh-transport-spike2` was deleted mid-build the same way. The laptop relay and server were also stopped with SIGTERM from outside this session, and the spike source was removed from the repository (commit `fc07b307`). The spike stopped there, without a third rebuild.

The only RTT evidence is a **loopback smoke test** on the laptop: 200 calls, one run each, not LAN, so not comparable to the requested measurement.

| Transport (laptop loopback) | Endpoint setup | Connect | First call | p50 | p95 | p99 | Selected path |
|---|---|---|---|---|---|---|---|
| WS+TLS | 1.06 ms | 5.02 ms | 0.42 ms | 0.092 ms | 0.167 ms | 0.238 ms | tcp+tls |
| iroh direct | 9.73 ms | 2.95 ms | 0.96 ms | 0.090 ms | 0.186 ms | 0.446 ms | `*ip:Ip(127.0.0.1:7001)` |
| iroh relay-only | 3.90 ms | 2.39 ms | 0.57 ms | 0.135 ms | 0.189 ms | 0.204 ms | `*relay:Relay(http://127.0.0.1:3340/)` |

Exact LAN commands prepared (server and relay on laptop, client on homelab; 3 reps × 1000 calls, fresh process per rep for cold connect):

```sh
# laptop
iroh-relay --dev
server --ws-port 8443 --iroh-port 7001 --cert certs/server.pem --key certs/server.key --relay http://192.168.0.142:3340 --seed 1
# homelab
client rtt --transport ws         --ws 192.168.0.142:8443 --ca certs/ca.pem --n 1000
client rtt --transport iroh       --iroh-ip 192.168.0.142:7001 --relay http://192.168.0.142:3340 --seed 1 --n 1000
client rtt --transport iroh-relay --relay http://192.168.0.142:3340 --seed 1 --n 1000
```

## Measurement 2 — simulated network switch (Docker on laptop)

### Topology

Three bridge networks: `wh-srv` 10.231.0.0/24, `wh-a` 10.231.1.0/24, `wh-b` 10.231.2.0/24.

- **Router container:** on all three networks, with `net.ipv4.ip_forward=1`.
- **Server container:** 10.231.0.10. Runs `iroh-relay --dev` and `server`. Routes to A and B go via the router.
- **Client container:** on A (10.231.1.10) and B (10.231.2.10), with
  - `ip route add 10.231.0.0/24 via 10.231.1.2 metric 10`
  - `ip route add 10.231.0.0/24 via 10.231.2.2 metric 20`

The server address stays constant; only the client's source address changes. No NAT.

### Procedure, per run

1. Create a fresh client container.
2. Start `client switch --secs 20 --deadline-ms 1000`.
3. After 8 s, find the active network with `ip -o route get 10.231.0.10`, then `docker network disconnect` it.

Observed route before and after (`ws`, run "pilot"):

```text
disconnect wh-a (10.231.0.10 via 10.231.1.2 dev eth1 src 10.231.1.10 uid 0 …)
after: 10.231.0.10 via 10.231.2.2 dev eth0 src 10.231.2.10 uid 0 …
```

Each transport got one pilot run to validate the harness (WS 1100.5 ms, iroh 336.8 ms; not counted), then 5 counted runs, alternating WS and iroh.

### Results (counted runs)

| Run | WS longest gap (ms) | WS failed in-flight | iroh longest gap (ms) | iroh failed in-flight |
|---|---|---|---|---|
| 1 | 1099.4 | 1 (timeout) | 315.0 | 0 |
| 2 | 1100.9 | 1 (timeout) | 294.2 | 0 |
| 3 | 1102.7 | 1 (timeout) | 436.5 | 0 |
| 4 | 1104.9 | 1 (timeout) | 321.3 | 0 |
| 5 | 1101.5 | 1 (timeout) | 324.6 | 0 |
| **Median** | **1101.5** | 1 | **321.3** | 0 |
| **Max** | **1104.9** | 1 | **436.5** | 0 |

Typical gap outside the switch: p50 ≈ 50 ms on both transports. WS: 380/381 calls succeeded per run, 1 reconnect per run, first attempt successful. iroh: 395–398 calls attempted, all succeeded, 0 reconnects.

Raw WS result excerpt (run 1):

```text
RESULT {"result":{"attempted":381,"deadline_ms":1000,"events":["9.258s call 166 timeout","9.258s relinked (reconnect=true)"],"failed_broken":0,"failed_timeout":1,"gap_p50_ms":50.061505,"longest_gap_end_s":9.303590134,"longest_gap_ms":1099.446229,"ok":380,"path_at_end":"tcp+tls","reconnects":1},"transport":"ws"}
```

### Did iroh migrate or reconnect?

**It migrated, inside the same connection, in all 5 runs** (0 reconnects; server logged no new connection). Client path events, run 1:

```text
[8.553s] path event Closed { id: PathId(0), remote_addr: Ip(10.231.0.10:7001), local_addr: Ip(Some(10.231.1.10))
[8.553s] path event Selected { id: PathId(2), remote_addr: Relay(http://10.231.0.10:3340/), … }
[8.559s] path event Selected { id: PathId(3), remote_addr: Ip(10.231.0.10:7001), local_addr: Ip(Some(10.231.2.10)) }
```

Server side (pilot): `Opened PathId(3) remote Ip(10.231.2.10:44359)`, `Closed PathId(0) remote Ip(10.231.1.10:44359)`, `Selected PathId(3)`.

In every run the relay path, open since ~0.35 s, became selected the instant the old path closed. A new direct path from the surviving interface was selected 1–6 ms later.

WebSocket never saw a socket error. The in-flight call hit the 1000 ms deadline, and the reconnect succeeded on the first attempt (~50 ms including the next 50 ms tick).

### Rule outcome

| | WS | iroh | iroh faster by |
|---|---|---|---|
| Median longest gap | 1101.5 ms | 321.3 ms | 780.2 ms |
| Max longest gap | 1104.9 ms | 436.5 ms | 668.4 ms |

780 ms < 2000 ms → **WebSocket is selected.**

## Measurement 3 — cost

### Dependency tree (`cargo tree -e normal`, laptop)

| Build | Lines | Unique crates (`--prefix none --no-dedupe \| sort -u`) |
|---|---|---|
| Base (tokio + serde_json, no transport) | 23 | 17 |
| `--no-default-features --features ws` | 86 | 53 |
| `--no-default-features --features iroh` (iroh default features) | 710 | 241 |
| Both | 729 | — |

### Release binary sizes (default release profile)

| Binary | macOS arm64 | macOS stripped | Linux x86_64 (homelab) |
|---|---|---|---|
| server, ws only | 2,666,464 | 2,182,016 | not recorded |
| client, ws only | 2,943,600 | 2,421,040 | not recorded |
| server, iroh only | 14,309,136 | 11,374,480 | 21,006,392 |
| client, iroh only | 14,439,136 | 11,508,032 | 21,185,160 |
| iroh-relay 1.3.0 (`cargo install --features server`) | 10,479,456 | 8,428,368 | not built |

### RSS

**The per-transport Linux RSS measurement was not run** (same interruption as Measurement 1). The only observation is `ps -o rss` on macOS, with the LAN server idle after the loopback smoke and switch-mode tests:

| Process (macOS arm64) | RSS |
|---|---|
| `server`, combined WS+iroh build, iroh endpoint connected to relay, no clients | 13,024 KB |
| `iroh-relay --dev`, one endpoint (the server) connected | 8,880 KB |

Per-transport idle and one-connection RSS on Linux is still open.

### Moving parts to operate

| | WebSocket+TLS | iroh + self-hosted relay |
|---|---|---|
| Processes | daemon | daemon + `iroh-relay` |
| Inbound ports | 1 TCP (443/8443) | daemon UDP (direct) + relay HTTP(S) TCP; QUIC address discovery needs another UDP port (7842 default) |
| Certificates | 1 server cert (public CA or a pinned private CA on devices) | relay TLS cert for production HTTPS/QAD; endpoint identity = Ed25519 key per device (no CA) |
| Identity/addressing | hostname + TLS | EndpointId (public key), relay URL, optional direct addrs; needs a way to distribute server id |
| Extra services | none | relay (n0 relays and DNS/pkarr discovery disabled here by `presets::Minimal` + custom relay map) |

## Caveats

- **Simulation ≠ phone switch.** Removing a container interface makes the kernel re-route instantly, with the server unchanged. A phone's Wi-Fi→cellular switch also changes NAT, MTU and latency, may pass through a period with no connectivity, and is governed by OS radio and power policy. Neither result predicts on-device behavior.
- **WS recovery is the deadline.** TCP reported nothing. Recovery equals the 1000 ms per-call deadline plus a reconnect (~100 ms). With a deadline above ~2.2 s (deadline + ~100 ms reconnect − ~320 ms iroh gap > 2 s), the same harness would show iroh more than 2 s faster. A production WS client would add a heartbeat and OS network-change hooks (e.g. `NWPathMonitor`) that could reconnect before the deadline. Neither was tested here.
- iroh's ~300 ms gap is the time between the interface removal and iroh closing the dead path. The time from `docker network disconnect` to path close was not separately instrumented.
- Loopback and Docker numbers all come from the laptop, which also ran the build tooling.
- The relay ran in `--dev` mode (plain HTTP, no QAD). A production relay needs TLS and QAD.

## Not yet tested

Can be done now:

- LAN RTT (Measurement 1) and per-transport Linux RSS, idle and with one connection.

Needs phones or off-LAN:

- Real Wi-Fi ↔ cellular handover on iOS and Android, foreground and background, including OS suspension of sockets.
- Off-LAN paths: carrier-grade NAT, hole-punching success rate from cellular to the home server, and relay-only fallback latency over the internet.
- A relay with TLS, QAD, and access control, reachable from outside; home router port exposure for each option.
- Battery and data cost of iroh keep-alives versus WS heartbeats.
- A WS client with a heartbeat and OS network-change notifications, compared against iroh migration.
