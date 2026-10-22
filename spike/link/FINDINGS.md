# Spike 6: a standing link between two workerd daemons

**Question:** can a Durable Object in plain workerd hold a WebSocket-over-TLS link to another workerd for good, carry calls both ways, notice failures, and reconnect, with self-signed certificates that each side pins?

## Verdict

**Yes, with `preventEviction = true` on the link's Durable Object namespace.** Without it, workerd evicted the dialing side's object, and the link with it, after about 140 s, even while heartbeats flowed every 5 s.

## Environment

| Item     | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Machine  | macOS arm64 laptop, both daemons on 127.0.0.1                                   |
| workerd  | 1.20261019.1 (the daemon's pinned version), `--experimental`                    |
| Code     | `link.js`, `laptop.capnp`, `home.capnp`, `setup.sh`, `make-cert.ts` in this folder |

## What was built

- Each daemon runs `link.js`: one `Link` Durable Object, reached through `idFromName("peer")`.
- **Laptop** dials: `env.PEER.fetch("https://peer.workhorse/ws", { headers: { Upgrade: "websocket" } })`. `PEER` is an external HTTPS service that pins home's certificate (`trustedCertificates`) and checks the name `peer.workhorse` (`certificateHost`), so the address can be anything.
- **Home** accepts: its `https` socket, with its own keypair, forwards `/ws` to its `Link` object, which accepts a `WebSocketPair` and returns 101. The accepted socket lives in home's object, so home can send calls back.
- Both sides ping every 5 s, drop the link after 15 s without a pong, and answer calls with a 2 s deadline (`unavailable` otherwise). The laptop redials with backoff of 100, 250, 500, 1000, then 2000 ms.
- Certificates: first round from `openssl` (`CA:TRUE`); second round from the CLI's built-in DER encoder (`daemon/packages/cli/src/identity/`), ECDSA P-256, self-signed, `CA:TRUE`, SAN `DNS:peer.workhorse`.

## Results

| Check | Result |
| --- | --- |
| TLS with pinned self-signed certificates, both issuers | Handshake and calls succeed with `openssl` certificates and with the built-in encoder's |
| Calls both ways over one link | laptop → home and home → laptop answer (`home got hi-home`, `laptop got hi-laptop`) |
| Idle, default eviction | **Link lost.** Dialed 10:13:40; home logged `lost: close 1006` at 10:16:00 (140 s). A status request at 10:16:52 constructed a fresh laptop object, which did not redial. Home's object, holding the accepted socket, stayed alive (192 s) |
| Idle, `preventEviction = true` | Link kept: home → laptop answered after 200 s with no other traffic; both objects alive 311 s, 0 reconnects |
| Home killed (SIGKILL), restarted about 6 s later | Laptop logged `close 1006` within the same second; 5 failed dials (`Network connection lost`) with backoff; redialed at 10:23:18.654, as home came back. Calls both ways worked again |
| Calls while the link is down | `unavailable` at once, not after the deadline |
| Home frozen (SIGSTOP), TCP left open | Laptop logged `heartbeat missed` 12.7 s after the freeze (15 s after the last pong). Its next dial **hung** until home was thawed 22 s later, then completed |
| Laptop killed | Home logged `close 1006` immediately; calls to the laptop returned `unavailable` |
| Memory, laptop, `phys_footprint` | 6,994 KB before the link, 7,554 KB with it: about 0.55 MB |
| SIGTERM to home with no links open | Still running after about 1.5 s; stopped with SIGKILL. Not investigated further |

## Consequences for the design

1. The link's Durable Object namespace sets `preventEviction = true`. This is workerd-only; Cloudflare cannot toggle eviction. A cloud daemon accepts links rather than dialing them, and the accepting side survived eviction here.
2. **A dial needs its own deadline.** A peer that accepts TCP but never finishes TLS stalls a dial indefinitely.
3. **Something must start the dialing side after every daemon start**, because a fresh object does not dial until it receives a request. `workhorse warm` already runs after every start (slice 1), so it can start the links too.
4. Heartbeats are what detect a dead path when TCP reports nothing. 5 s pings with a 15 s limit detected one in 12.7 s.
5. The stop path needs a check: workerd did not exit promptly on SIGTERM. The service managers' stop timeouts should cover this, or the daemon should close its links on shutdown.

## Not tested

- Two different machines, a real network, or an overlay network (Tailscale, WireGuard): every run used 127.0.0.1.
- Linux, and either OS sandbox: neither seatbelt nor bubblewrap rules for listening on a TCP port were exercised.
- More than one peer, concurrent calls, and large messages.
- Long idle periods beyond about 5 minutes, and laptop sleep and wake.
