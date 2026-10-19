# Spike 3: one daemon build on workerd and Cloudflare

**Verdict: the single-daemon shape holds.** One bundle — a `no_std` Rust core compiled to wasm, wrapped by a TypeScript Durable Object — passed every check on plain workerd (laptop, local disk) and on Cloudflare, unchanged.

## What was built

| Part | What it is |
|---|---|
| `core/` | `#![no_std]` mailbox state machine: inputs in, effects out. Remembered keys, sequence numbers, unacked set, recurring task. Two unit tests |
| `core-wasm/` | `wasm-bindgen` glue: JSON input → `core` → JSON effects. 103 KB `.wasm` |
| `worker/src/index.ts` | Durable Object `Mailbox` performing effects with SQLite, alarms, and hibernating WebSockets. `Net` entrypoint adds a credential. `/dynamic` loads Dynamic Workers |
| `config.capnp` | Plain workerd config: `localDisk` storage, `enableSql`, `workerLoader` |
| `cloudflare.config.ts` | Same `dist/index.js` deployed with the `cf` CLI |
| `test/run.ts` | Black-box harness over real WebSockets; locally it SIGKILLs and restarts workerd |

## Commands

```sh
bun run build                       # wasm-pack + bun build → dist/
bun test/run.ts                     # local: plain workerd 1.20261019.1
SETTLE_SECONDS=100 bun test/run.ts  # local, longer memory settle
cf deploy                           # Cloudflare (personal account)
REMOTE_BASE=https://workhorse-spike-mailbox.stevenjpx2.workers.dev bun test/run.ts
```

## Results

| Check | workerd (macOS arm64) | Cloudflare |
|---|---|---|
| Same key published twice is stored and delivered once | PASS | PASS |
| Reconnect redelivers only unacked events | PASS | PASS |
| After SIGKILL (local) or reconnect (remote): unacked survives, acked key still rejected, sequence continues | PASS (restart 32–44 ms) | PASS |
| A new consumer replaces the old one (close code 4000) | PASS | PASS |
| Recurring task fires from alarms | PASS | PASS |
| Alarms keep firing across SIGKILL / with no consumer | PASS | PASS |
| Idle socket across the eviction window still works; object restored from SQLite | PASS (one constructor re-run observed) | PASS |
| Dynamic Worker with `globalOutbound: null` cannot `fetch()` | PASS | PASS |
| Dynamic Worker reaches the network only through its `NET` capability, which adds `Authorization` | PASS (loopback echo) | PASS (httpbin echoed `Bearer daemon-held-secret`) |
| Storage is SQLite files on local disk | PASS (213 `.sqlite` files) | n/a |

Observed output, local:

```
PASS cold start {"coldStartMs":35}
PASS memory measured {"idleMb":30,"after200MailboxesMb":169,"settleSeconds":20,"settledMb":163}
PASS after SIGKILL: unacked survives, acked key still remembered, seq continues {"restartMs":44,"delivered":[2,3],"again":{"status":"duplicate"},"fresh":{"status":"published","seq":3}}
PASS alarms keep firing across SIGKILL {"lastBeforeGap":4,"deliveredAfter":[1,2,3,4,5,6,7,8,9,10,11]}
PASS dynamic worker without outbound cannot fetch {"direct":"blocked: This worker is not permitted to access the internet via global functions like fetch(). It must use capabilities (such as bindings in 'env') to talk to the outside world."}
ALL PASS
```

Observed output, Cloudflare:

```
PASS dynamic worker reaches the network only through its capability, which adds the secret {"envKeys":["NET"],"echoed":{"headers":{"Authorization":"Bearer daemon-held-secret","Host":"httpbin.org",…}}}
ALL PASS
```

## Measurements

| Measure | Value |
|---|---|
| workerd cold start to first `/health` | 32–37 ms |
| workerd RSS, idle | 30–31 MB |
| workerd RSS after 200 mailboxes touched | 169–174 MB |
| RSS 20 s / 100 s later | 163–168 MB / 163 MB — not returned |
| Cloudflare upload | 112.84 KiB (45.61 KiB gzip); Worker startup 1 ms |
| `core.wasm` | 103 KB (`serde_json` dominates) |

## Findings that change or constrain the design

| Finding | Consequence |
|---|---|
| workerd's `localDisk` storage is marked **"EXPERIMENTAL; SUBJECT TO BACKWARDS-INCOMPATIBLE CHANGE"** | Pin the workerd version; test upgrades against saved data before rolling forward |
| Worker Loader requires **`workerd --experimental`** | The bridge launches workerd with `--experimental` while `worker` apps rely on Dynamic Workers |
| RSS grows about **0.7 MB per active mailbox** and is not returned after idle | Fine for tens of sessions. Bound the number of live mailboxes; measure again with real apps |
| `ctx.exports.Net` must be called with `{ props }` before it can go into a Dynamic Worker's `env` | `props` is the natural place to carry the app's identity and grant |
| The Cloudflare MCP sends upload bodies as UTF-8 text, which corrupts `.wasm` (a 35-byte module arrived as 36 bytes), and Workers block runtime wasm compilation (`Wasm code generation disallowed by embedder`) | Deploy with the `cf` CLI (or wrangler), not the MCP upload endpoint |
| `enable_ctx_exports` is the default since 2025-11-17 | No flag needed |

## Not covered

- workerd memory on the homelab's Linux x86_64.
- Dynamic Workers under load or with many apps.
- Running workerd inside the nono sandbox (spike 1 covers the sandbox; the combination belongs to slice 1).

The Cloudflare Worker `workhorse-spike-mailbox` was deleted after the run.

## Core shape comparison

Three shapes for the same rules, run under one shared shell on plain workerd 1.20261019.1, macOS 15.7.4 arm64 (Apple M1 Max, 32 GB). Rust 1.96.0, wasm-pack 0.15.0, wasm-bindgen 0.2.129, Bun 1.4.3.

| Variant | Rules | Glue | Entry |
|---|---|---|---|
| **A** TypeScript, no wasm | `core-ts/mailbox.ts` (port of `core/src/lib.rs`; tests in `mailbox.test.ts`) | none: called directly | `worker/src/entry-ts.ts` |
| **B** Rust, two crates | `core/` (`no_std`) | `core-wasm/` (std, wasm-bindgen, JSON strings) | `worker/src/entry-rust2.ts` |
| **C** Rust, one crate | `core-one/src/lib.rs` (std, `cdylib`+`rlib`) | private `mod glue` in the same file | `worker/src/entry-rust1.ts` |

The shell from `worker/src/index.ts` moved into `worker/src/shell.ts` as `defineShell(newCore)`, with the JSON round-trip moved out of it into the Rust entries. Each entry supplies `handle(input) => Effect[]`: A calls the TS mailbox; B and C wrap `JSON.parse(core.handle(JSON.stringify(input)))`. The shell gained `/bench?n=N`. `config.capnp` became `config-{ts,rust2,rust1}.capnp` embedding `dist-{ts,rust2,rust1}/`. `cloudflare.config.ts` now points at `dist-rust2/index.js`.

### Commands

```sh
bun run build                                   # build:ts, build:rust2, build:rust1 → dist-ts/, dist-rust2/, dist-rust1/
CONFIG=config-ts.capnp    bun test/run.ts       # correctness gate, per variant (default CONFIG=config-rust2.capnp)
CONFIG=config-rust2.capnp bun test/run.ts
CONFIG=config-rust1.capnp bun test/run.ts
ROUNDS=3 bun test/measure.ts                    # cold start, bench, latency, RSS → measure-raw.jsonl
cargo test --workspace && bun test core-ts      # unit tests: 2 + 2 + 2 pass
cargo clippy -p spike-core-one --all-targets -- -D warnings
cargo tree -p <crate> -e normal --prefix none | sort -u | wc -l
gzip -9 -c <file> | wc -c
```

Correctness gate: `test/run.ts` printed 12/12 PASS (`ALL PASS`) for each of A, B, and C, both before and after the measurements.

`test/measure.ts`, per variant per round (variant order rotates each round): 5 cold starts (spawn → first `/health` 200, 2 ms polling, fresh data dir). Then a fresh process: RSS idle at 2 s, one warm-up `/bench?n=200000`, 5 timed calls (client wall time; workerd CPU from `ps -o time=` before/after, 10 ms resolution), RSS 1 s later. Then a second fresh process: RSS idle, touch 200 mailboxes (10 × 20 concurrent, as in `run.ts`), RSS, then 2000 sequential `mailbox.publish` over one WebSocket (real SQLite path). One bench call = 200,000 × (publish unique key + ack) + 20,000 duplicate publishes = 420,000 `handle` calls. Every one of the 45 timed calls returned checksum 20000320000.

### Comparison

Medians. Bench: 15 calls (5 × 3 rounds); cold start: 15 starts; latency and RSS: 3 rounds.

| Metric | A: TS | B: Rust 2 crates | C: Rust 1 crate |
|---|---|---|---|
| Languages | TS | Rust + TS | Rust + TS |
| Rules, non-blank non-comment lines | 112 | 152 | 139 |
| Rust↔JS glue, lines | 0 | 21 | 27 (incl. 4-line `#[allow]`) |
| Entry adapter, lines (shared `shell.ts`: 211) | 6 | 12 | 12 |
| Generated JS glue (wasm-bindgen) | none | 257 lines | 257 lines |
| Build config, lines (Cargo, clippy, script) | 1 | 29 | 50 (incl. 28-line `clippy.toml`) |
| workerd config, lines | 23 | 24 | 24 |
| Unit test lines | 27 | 44 | 44 |
| Build tools | bun | rustup + `wasm32-unknown-unknown`, cargo, wasm-pack (fetches wasm-bindgen-cli), wasm-opt (found on PATH), bun | same as B; clippy enforces the I/O ban |
| Build commands | 1 (`bun build`) | 3 (`wasm-pack` → cargo, wasm-bindgen, wasm-opt; `bun build`; `cp`) | 3 (same) |
| Clean build, s (3 runs) | 0.019 (0.038, 0.018, 0.019) | 9.13 (11.05, 9.13, 8.93) | 8.38 (8.42, 8.38, 8.29) |
| Incremental build after touching rules, s | 0.022 | 1.88 | 1.30 |
| Rust deps (`cargo tree … \| wc -l`) | — | 24 (18 distinct third-party) | 23 (18 distinct third-party) |
| npm runtime deps | 0 | 0 | 0 |
| Bundle bytes: JS + wasm | 10,074 + 0 = **10,074** | 12,513 + 103,460 = **115,973** | 12,514 + 136,178 = **148,692** |
| gzip -9 bytes | **3,222** | 4,065 + 42,555 = **46,620** | 4,068 + 55,625 = **59,693** |
| Bench wall per call (420k ops), ms | 46.3 | 937.2 | 993.7 |
| Bench ops/s | 9,073,650 | 448,163 | 422,661 |
| Bench µs/op | 0.110 | 2.231 | 2.366 |
| workerd CPU per bench call, ms | 50 | 940 | 990 |
| E2E publish latency p50 / p95, ms | 0.170 / 0.359 | 0.174 / 0.370 | 0.172 / 0.374 |
| RSS idle, MB | 28.4 | 30.6 | 31.0 |
| RSS after 6 bench calls, MB | 95.1 | 153.2 | 152.2 |
| RSS after 200 mailboxes, MB | 159.2 | 175.3 | 175.6 |
| Cold start to first `/health`, ms | 17.4 | 16.7 | 17.4 |

Per-round raw values (all lines in `measure-raw.jsonl`):

```
                 A: TS                      B: Rust 2                  C: Rust 1
ops/s by round   9576406 9174362 8756324    443244 449841 448163       422661 428360 417658
bench wall range 42.6–49.9 ms               911.4–972.1 ms             969.7–1109.3 ms
CPU range        40–50 ms                   910–960 ms                 970–1020 ms
p50 by round     0.173 0.167 0.170          0.174 0.178 0.172          0.169 0.172 0.202
p95 by round     0.374 0.340 0.359          0.364 0.451 0.370          0.350 0.374 0.511
cold by round    14.1 17.9 17.4             16.9 15.9 17.0             16.0 18.2 17.3
RSS after bench  94.3 95.5 95.1             152.4 154.2 153.2          152.1 152.3 152.2
RSS after 200    159.2 158.2 160.1          175.3 173.1 178.0          178.8 175.6 168.4
```

### Lint-bites proof (C)

`core-one/clippy.toml` bans `std::fs::{read, read_to_string, read_dir, write, copy, rename, remove_file, remove_dir_all, create_dir_all, metadata}`, `SystemTime::now`, `Instant::now`, `thread::spawn`, and `process::{exit, abort}` as methods. It bans `fs::File`, `fs::OpenOptions`, `net::{TcpStream, TcpListener, UdpSocket}`, `process::Command`, `thread::Builder`, `wasm_bindgen::JsValue`, and `wasm_bindgen::JsError` as types. `mod glue` carries the one `#[allow(clippy::disallowed_types, reason = "…")]`.

Step 1: `let _ = std::fs::read("acks.log");` added to the `ack` rule:

```
error: use of a disallowed method `std::fs::read`
   --> core-one/src/lib.rs:135:17
    |
135 |         let _ = std::fs::read("acks.log");
    |                 ^^^^^^^^^^^^^
    |
    = note: the core has no I/O
    = note: `-D clippy::disallowed-methods` implied by `-D warnings`
error: could not compile `spike-core-one` (lib) due to 1 previous error
```

Step 2: an aliased import (`use std::fs::read as load; load(…)`), `wasm_bindgen::JsValue::from_f64(1.0)`, and `std::time::Instant::now()` in the same rule, exit 101:

```
error: use of a disallowed method `std::fs::read`            --> core-one/src/lib.rs:136:17
error: use of a disallowed type `wasm_bindgen::JsValue`      --> core-one/src/lib.rs:137:17
error: use of a disallowed method `std::time::Instant::now`  --> core-one/src/lib.rs:138:17
error: could not compile `spike-core-one` (lib) due to 3 previous errors
```

Step 3: with the glue's `#[allow]` removed, the glue itself fails with 8 errors (`JsValue` in wasm-bindgen macro expansions, `JsError` in `handle`), so the scoped allow is load-bearing. With the probes removed and the allow restored: `cargo clippy -p spike-core-one --all-targets -- -D warnings` exits 0, also with `--target wasm32-unknown-unknown`.

### Notes

| Observation | Detail |
|---|---|
| `cdylib`+`rlib` silently drops LTO | `cargo build -v` passes `-C lto` to `spike_core_wasm` (cdylib) but not to `spike_core_one` (cdylib+rlib), with no warning. Rebuilt with `crate-type = ["cdylib"]` only, C measured 101,977 B wasm (41,849 gzip), 456,628 ops/s, 2.190 µs/op, CPU 920 ms/call, p50/p95 0.176/0.348 ms, RSS after 200 mailboxes 177.8 MB (`measure-raw-c-cdylib-only.jsonl`). That matches B. The table's C column uses the specified `cdylib`+`rlib`. |
| The JSON boundary dominates the A-vs-wasm gap | Bun 1.4.3 (JavaScriptCore, not workerd's V8), same bench, 3 runs: TS direct 67–70 ms; TS with the same `JSON.stringify`/`parse` round-trip on input and output 416–429 ms; B's wasm 576–603 ms. |
| End-to-end latency does not separate the variants | p50 0.170–0.174 ms for all three; the ~2 µs core call is about 1% of a WebSocket + SQLite round-trip |
| Wasm variants hold more memory after CPU work | +58 MB after bench and +16 MB after 200 mailboxes versus A. A wasm instance's linear memory can grow but not shrink; A's heap is garbage-collected |
| B's `core` fails `cargo clippy -D warnings` (pre-existing) | 3 × `vec_init_then_push`. C's port uses `vec![…]`, so C's rules are 13 lines shorter. The difference is not caused by the crate shape |
| Clippy's `disallowed-*` lists take exact paths, no globs | `std::fs::*` must be written out item by item; unlisted items (e.g. `std::fs::hard_link`, `std::env::var`) pass. The ban is a lint, so any `#[allow]` in the crate overrides it. B's `no_std` crate cannot name `std` at all |
| A's exhaustiveness is enforced only by a type checker | `bun build` strips types without checking them, and the spike has no `tsconfig`/`tsc`. The `never` default in `Mailbox.handle` is checked only when `tsc` runs. Rust's `match` is checked on every build |
| Cold start is lower than the earlier 32–37 ms | 2 ms polling here versus 25 ms in `run.ts`; all three variants fall within 14–18 ms |
| Rust build times assume a warm cargo registry | Clean build = empty `CARGO_TARGET_DIR`, crates already downloaded |

### Trade-offs observed

- **A** has the smallest bundle (3.2 KB gzip versus 47–60 KB), one language, one build tool, and ~20 ms builds. Its core loop runs about 20× faster than B/C, mostly because there is no JSON boundary. Its exhaustiveness and purity depend on running `tsc` and a lint; there is no compiler-level I/O barrier.
- **B** enforces purity structurally (`no_std` cannot reach `std::fs`, `std::net`, or the clock) at the cost of a second crate and a second Cargo manifest. Clean build 9 s, incremental 1.9 s.
- **C** keeps rules and glue in one file and enforces purity with a 28-line `clippy.toml`. The ban covers only the listed paths, and any `#[allow]` overrides it. As specified (`cdylib`+`rlib`) it lost LTO: 32% more wasm and 6% slower. As `cdylib` only, it matched B.
- Over a real socket with SQLite, the three are indistinguishable in latency and cold start. They differ in RAM by up to 16 MB at 200 mailboxes and 58 MB after the CPU bench.
