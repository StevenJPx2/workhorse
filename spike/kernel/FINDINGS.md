# Spike 7: kernel retest — a Rust kernel inside workerd, measured end to end

Evidence, not production design. Question: does a `no_std` Rust kernel inside workerd meet the daemon's real lightness targets (cold start, private memory, memory per mailbox, end-to-end latency, CPU per message, bundle size) once the boundary is designed for it? Spike 3 measured a JSON-per-call boundary in a tight loop; this spike fixes that and measures the daemon instead.

The spike ran twice. **Kernel 1** ported spike 3's rules line by line: a `BTreeSet<String>` of remembered keys, a fresh copy of every key and event wherever the rules store or return it, and effects that send every text back to the shell. **Kernel 2**, the code in this folder, keeps the behaviour and changes only the data handling: a hashed key set (`key_set.rs`), each text stored once and shared (`Rc<str>`), and effect texts that refer to the input's key or event instead of repeating them. [Why kernel 1 was slow](#why-kernel-1-was-slow) explains the change.

**Kernel 3**, the code in this folder now, is kernel 2 plus the fixes its profile pointed to: unacknowledged events in a deque sorted by sequence number (`unacked.rs`) instead of a `BTreeMap`, and glue that keeps one input buffer and its views and writes ASCII bytes directly. The shell, shared by both rule sets, also accepts JSON-RPC batch frames and has a coalescing mode. [Fair comparison](#fair-comparison) measures every shell change on both the TypeScript rules and the Rust kernel, because those changes help both.

## What was built

| Part | What it is |
|---|---|
| `kernel/` | `#![no_std]`, `#![forbid(unsafe_code)]`, no dependencies. Spike 3's mailbox rules (`mailbox.rs`, same behaviour); a set of shared strings with open addressing and FNV-1a hashes (`key_set.rs`); unacknowledged events in a deque sorted by sequence number, with tombstones compacted once they outnumber live entries (`unacked.rs`); a binary wire format (`wire.rs`): little-endian integers, length-prefixed UTF-8, every length checked against the remaining bytes and a limit before allocation, and `step`, which decodes a whole batch before running any of it |
| `kernel-wasm/` | `cdylib` glue with four raw exports: `alloc`, `step`, `output`, `close`. No wasm-bindgen, no serde, no JSON. The host writes into a Rust-owned buffer; nothing dereferences a host pointer. The only unsafe items are the four `#[unsafe(no_mangle)]` attributes, each with a scoped `#[expect(unsafe_code, reason = …)]`, as approved |
| `ts/mailbox.ts` | Variant A: spike 3's TypeScript rules, unchanged except one type annotation spike 3 never type-checked |
| `ts/wire.ts`, `ts/rust-kernel.ts` | The shell's side of the wire format: encodes a batch straight into wasm memory with `encodeInto`, decodes effects back, and resolves effect texts that refer to an input to that input's own JavaScript string |
| `worker/shell.ts` | Spike 3's Durable Object shell, without the Dynamic Worker checks. `/bench?n=&batch=` runs the CPU bench with `batch` inputs per core call. A JSON-RPC 2.0 batch frame (an array of requests, at most 4,096) runs through one core call and gets one array reply. With `coalesce: true`, single-request frames are queued and flushed by a zero-delay timer in one core call, at most 4,096 at a time |
| `worker/entry-*.ts`, `config-*.capnp` | Five variants on plain workerd 1.20261019.1: A, R, RI, and A and R with coalescing |
| `test/diff.ts` | Correctness gate (below) |
| `test/counters.ts` | Linux only: `perf stat` and `/proc` CPU per request and sequential latency for A and R × single frames, batch frames and coalescing × WebSocket compression on and off. Raw lines in `counters-raw-linux.jsonl` |
| `test/measure.ts` | Behaviour check through workerd, then measurements. Raw lines: kernel 1 in `measure-raw-{darwin,linux}.jsonl` and `measure-cold-linux.jsonl`; kernel 2 in the same names with `-v2` |

| Variant | Rules | Boundary |
|---|---|---|
| **A** `A-ts` | TypeScript, called directly | None |
| **R** `R-rust` | Rust `no_std`, one wasm instance per isolate; each Durable Object is a mailbox ID in it | Binary, batched |
| **RI** `RI-rust-instance` | Same wasm, one instance per Durable Object, freed by the garbage collector | Binary, batched |

Build profile: `opt-level = "z"`, LTO, one codegen unit, `panic = "abort"`, `strip`, a 64 KiB wasm stack, then `wasm-opt -Oz`. The module imports nothing and starts with 2 pages (128 KiB) of memory.

## Commands

```sh
bun install --frozen-lockfile
bun run build          # cargo (wasm32) + wasm-opt, then bun build for each variant
bun run types          # tsc for the worker and the tests
bun run diff           # correctness gate
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy --workspace --target wasm32-unknown-unknown -- -D warnings
cargo test --workspace
ROUNDS=3 bun test/measure.ts                      # macOS
WORKERD=$PWD/bin/workerd ROUNDS=3 bun test/measure.ts   # NixOS: a copy of the binary, flushed with `sync`
WORKERD=$PWD/bin/workerd ROUNDS=3 COLD_ONLY=1 RAW_FILE=measure-cold-linux.jsonl bun test/measure.ts
# Kernel 2: the same three runs with RAW_FILE=measure-raw-darwin-v2.jsonl,
# measure-raw-linux-v2.jsonl and measure-cold-linux-v2.jsonl
CHECK_ONLY=1 bun test/measure.ts                  # behaviour through workerd, all five variants
WORKERD=$PWD/bin/workerd ROUNDS=10 bun test/counters.ts  # NixOS, perf on PATH
```

## Correctness

| Check | Result |
|---|---|
| `test/diff.ts`: 300 seeded sequences × 400 inputs (publish with repeated and non-ASCII keys, ack of valid and invalid sequence numbers, connect, every, tick, restore), random batch sizes 1–20, real wasm build against the TypeScript rules | All effects equal, on macOS (Bun) and NixOS (Bun) |
| Gate bites | Kernel 1: changing the tick event's timestamp by 1 ms fails at `seed 1, step 13`. Kernel 2: encoding the event reference as the key reference fails at `seed 1, step 13`. Both reverted, both pass |
| Buffer and memory growth between calls | `test/diff.ts` publishes batches of 1–32 KiB events; reusing the shell's views across memory growth fails it with a detached-buffer error, while the 300 sequences alone still pass |
| Gate gap found and closed | Comparing only hashes in the key set passed the diff gate, since real keys almost never share a hash. `equal_hashes_still_compare_text` plants an entry with the same hash and other text, fails on that bug, and passes on the real comparison |
| Malformed batches through the raw exports | Truncated (−2), unknown tag (−3), invalid flag (−4), over the batch limit (−5), text over 64 KiB (−6), trailing bytes (−8), length beyond the buffer (−1), input over 16 MiB (null pointer). A batch with a bad input after a good one runs neither (`a_malformed_batch_runs_nothing`) |
| Rust unit tests | Kernel 3: 14 pass: spike 3's two mailbox tests, three key-set tests, three unacked-deque tests, six wire tests |
| Unacked deque bites | Compaction that keeps tombstones instead of live entries fails `out_of_order_acks_keep_order_and_bound_tombstones`; delivering in reverse order fails the diff gate at `seed 1, step 13`. Both reverted, both pass |
| Batch frames and coalescing through workerd (`CHECK_ONLY=1`) | All five variants: a frame of publish, duplicate publish, unknown method and ack replies `published`, `duplicate`, a method-not-found error and `acked` in order; after SIGKILL the duplicate is still refused and only the never-acknowledged event is redelivered |
| Clippy | The local policy's lint set (pedantic, nursery, no panics, no indexing, no `as`), host and `wasm32` targets: clean |
| Through workerd, every variant, every round | Publish, duplicate, SIGKILL, restart on the same storage, duplicate still refused, unacked event redelivered, ack, next sequence number |
| Bench checksum | 20000320000 on every call, every batch size, every variant (the same value as spike 3) |

## Bundle size

| File | Bytes | gzip -9 |
|---|---|---|
| A: `dist-ts/index.js` (minified shell + rules) | 5,747 | 2,330 |
| R: `dist-rust/index.js` (minified shell + wire glue), kernel 1 | 7,798 | 2,968 |
| R: `dist-rust/index.js`, kernel 2 | 8,044 | 3,065 |
| R: `kernel.wasm`, kernel 1 | 40,366 | 18,411 |
| R: `kernel.wasm`, kernel 2 | 39,353 | 17,930 |
| A: `dist-ts/index.js`, shell with batch frames and coalescing | 6,824 | 2,726 |
| R: `dist-rust/index.js`, kernel 3 glue and the same shell | 10,102 | 3,792 |
| R: `kernel.wasm`, kernel 3 (no `BTreeMap`) | 35,928 | **16,592** |
| Spike 3 B: `spike_core_wasm_bg.wasm` (serde_json, wasm-bindgen) | 103,460 | 42,555 |

Kernel 2 is 58% smaller than spike 3's wasm after gzip and under the `core` budget of 20 KB gzip. Its hash set replaced more code than it added.

## Kernel 2 results

Same procedure as kernel 1 below: three rounds per machine, variant order rotated each round, ranges over the rounds. Raw lines in `measure-raw-darwin-v2.jsonl`, `measure-raw-linux-v2.jsonl` and `measure-cold-linux-v2.jsonl`. The macOS run overlapped unrelated load (load average 13 at the start, 7 at the end, on 10 cores), so its CPU and latency rows are noisier than kernel 1's; an earlier attempt during heavier load was discarded. The homelab was idle.

| Metric | macOS A: TS | macOS R | macOS RI | Homelab A: TS | Homelab R | Homelab RI |
|---|---|---|---|---|---|---|
| Cold start, median, ms | 15 | 15 | 15 | 50 (46–65) | 52 (43–73) | 50.5 (45–80) |
| Idle private memory, MB | 7.3–8.0 | 7.2–8.5 | 7.9–8.2 | 9.0 | 9.3–9.4 | 9.3–9.4 |
| Private memory per mailbox, KB | 608–610 | 624–636 | 718–728 | 553–554 | 568–570 | 595–596 |
| Private memory after the CPU bench, MB | 113–120 | 107–109 | 189–195 | 117.0–117.1 | 100.6–100.8 | 184.4–184.5 |
| **CPU per 1,000 real messages**, ms | **71.5–75.5** | **75–78** | 72.5–93.5 | **1,106–1,139** | **1,202–1,248** | 1,236–1,269 |
| End-to-end publish p50, ms | 0.102–0.111 | 0.107–0.134 | 0.118–0.139 | 1.67–3.29 | 3.33–3.38 | 3.32–3.40 |
| End-to-end publish p95, ms | 0.202–0.348 | 0.219–0.393 | 0.383–0.469 | 2.42–3.70 | 3.77–3.82 | 3.81–3.86 |
| CPU bench, batch 1, µs per call | 0.233 | **0.867** (kernel 1: 1.276) | 0.890 | 0.999 | **4.589** (kernel 1: 6.245) | 4.486 |
| CPU bench, batch 64, µs per call | 0.174 | **0.453** (kernel 1: 0.890) | 0.461 | 0.443 | **1.202** (kernel 1: 2.335) | 1.211 |

The homelab's cold starts come from the `COLD_ONLY=1` rerun, as for kernel 1. Its A p50 of 1.67 ms is one round; the other two are 3.25–3.29 ms.

Kernel 2 halved the CPU bench on both machines: R is now 2.6–2.7× slower than V8's JIT in batches of 64 (kernel 1: 5.3×) and 3.7–4.6× unbatched (kernel 1: 5.5–6.4×). **CPU per real message barely moved**: +3–6% on macOS, +8–10% on the homelab on disk, against +8% and +7–10% for kernel 1. The per-message gap is therefore not the kernel's computation; see [CPU per message, split](#cpu-per-message-split).

## Kernel 1 results: macOS

Three rounds, variant order rotated each round, every value from `measure-raw-darwin.jsonl`. Ranges are the three rounds; cold start is the median of 15 starts.

| Metric | A: TS | R: Rust, shared instance | RI: Rust, instance per object |
|---|---|---|---|
| Cold start to first `/health`, ms | 17 | 18 | 18 |
| Idle private memory (`phys_footprint`), MB | 6.2–7.0 | 7.4–7.7 | 8.0–8.3 |
| Idle RSS, MB | 27.5–28.3 | 29.2–29.5 | 29.7–30.1 |
| Private memory after 200 mailboxes, MB | 126 | 129–130 | 147 |
| Private memory per mailbox, KB | 608–612 | 624–630 | 714–717 |
| Private memory after the CPU bench, MB | 112–115 | 105–108 | 191–193 |
| Private memory after 20,000 more messages, MB | 156–157 | 157–161 | 168–171 |
| **CPU per 1,000 real messages** (WebSocket + SQLite, 20,000 pipelined), ms | **66–69** | **73–74** | 72.5–76.5 |
| End-to-end publish p50, ms | 0.101–0.102 | 0.106–0.114 | 0.105–0.111 |
| End-to-end publish p95, ms | 0.346–0.355 | 0.348–0.369 | 0.348–0.361 |
| CPU bench, batch 1, ms per 420,000 calls | 96.7–98.8 | 534–539 | 554–558 |
| CPU bench, batch 1, µs per call | 0.233 | 1.276 | 1.321 |
| CPU bench, batch 64, ms | 68.6–71.3 | 373–375 | 377–387 |
| CPU bench, batch 64, µs per call | 0.168 | 0.890 | 0.903 |

Against spike 3 on the same machine and workerd version: its JSON boundary took 937 ms for the batch-1 bench; R takes 536 ms unbatched and 374 ms in batches of 64. A's bench here takes 97 ms rather than spike 3's 46 ms because the harness now builds input arrays and goes through the shared `Core` interface, so compare variants within this table.

## Kernel 1 results: NixOS homelab

Same procedure, `measure-raw-linux.jsonl`. Storage was a temporary folder on the homelab's disk (`/dev/sda2`), so every message waits for SQLite to sync, which dominates latency and CPU here.

| Metric | A: TS | R: Rust, shared instance | RI: Rust, instance per object |
|---|---|---|---|
| Cold start, disk settled (`measure-cold-linux.jsonl`, 30 starts), median (min–max), ms | 48 (42–75) | 51 (43–60) | 51 (44–58) |
| Idle private memory (`Private_Dirty`), MB | 9.0 | 9.4 | 9.3–9.4 |
| Idle RSS, MB | 46.6–47.5 | 48.7–48.8 | 47.8–49.0 |
| Private memory after 200 mailboxes, MB | 116.8–117.1 | 120.5–121.0 | 124.7–125.1 |
| Private memory per mailbox, KB | 552–553 | 569–572 | 590–593 |
| Private memory after the CPU bench, MB | 115.1–116.3 | 102.5–103.0 | 185.3–185.9 |
| CPU per 1,000 real messages, ms | 1,159–1,172 | 1,277–1,285 | 1,280–1,328 |
| End-to-end publish p50, ms | 3.28–3.32 | 3.36–3.41 | 3.37–3.46 |
| End-to-end publish p95, ms | 3.70–3.73 | 3.83–3.90 | 3.81–3.92 |
| CPU bench, batch 1, ms (µs per call) | 402–433 (0.977) | 2,594–2,654 (6.245) | 2,612–2,678 (6.299) |
| CPU bench, batch 64, ms (µs per call) | 183–187 (0.437) | 971–1,037 (2.335) | 976–991 (2.351) |

The cold starts inside the main run were disturbed: one variant per round measured 170–580 ms, and which one followed no variant (R in rounds 0 and 1, RI in round 2) while the same variant measured 44–60 ms in another round. The previous variant's deleted storage was still being written back to disk. `COLD_ONLY=1` reruns the cold starts alone after `sync` and a 5 s pause; that table row comes from the rerun.

### CPU per message, split

A throwaway probe (not in the repository) pipelined 20,000 publishes into one mailbox and read user and system CPU from `/proc/<pid>/stat`, twice per variant, on disk and on tmpfs (`/dev/shm`):

| Storage | Variant | Wall, s | User CPU per 1,000, ms | System CPU per 1,000, ms |
|---|---|---|---|---|
| Disk | A | 57.4–57.5 | 758–767 | 406–410 |
| Disk | R | 58.5–58.8 | 833–838 | 412–427 |
| tmpfs | A | 4.18–4.23 | 151–152 | 45–46 |
| tmpfs | R | 4.74–4.87 | 180–185 | 47–50 |

Kernel 1 adds about 30–75 µs of user CPU per real message on the homelab, while the CPU bench predicts about 5 µs per call there (6.2 against 1.0 µs). On macOS the same gap is about 6 µs per message.

A second throwaway probe ran kernel 2 on tmpfs, 20,000 pipelined publishes, three rounds, with two extra variants built outside the repository: **A+W**, the TypeScript rules with the Rust kernel instantiated at module scope and never called, and **A+X**, the TypeScript rules plus one empty batch through the Rust kernel per input (the crossing with no work):

| Variant | User CPU per message, µs | System CPU per message, µs |
|---|---|---|
| A: TypeScript | 149.5–155 | 43–44 |
| A+W: TypeScript, idle wasm instance | 145.5–152.5 | 44–45 |
| A+X: TypeScript plus an empty crossing | 158–163 | 45–47.5 |
| R: kernel 2 | 165–176 | 44–48 |

An idle instance costs nothing. The variants differ by about 8 µs (empty crossing) and 19 µs (kernel 2) of user CPU per real message, against 3.6 µs for a whole Rust call in the hot CPU bench (4.59 against 1.0 µs). Three rounds of a single variant vary by up to ±10 µs, though, so the hardware counters below, paired by round, are the firmer evidence.

### Hardware counters

A third throwaway probe attached `perf stat` (user space only, `perf_event_paranoid = 2`) to workerd on the homelab, tmpfs storage. In each process it counted one warmed CPU-bench call (420,000 core calls, one input each) and then 20,000 pipelined real publishes after 2,000 warm-up ones. First with the original glue, three rounds, means per real message or per bench call:

| Variant | Where | Cycles | Instructions | L1 instruction-cache misses | Last-level cache misses | Branch misses |
|---|---|---|---|---|---|---|
| A: TypeScript | Real message | 435,900 | 210,400 | 12,707 | 180 | 1,417 |
| A+X: empty crossing | Real message | 454,200 | 214,500 | 13,097 | 207 | 1,472 |
| R: kernel 2 | Real message | 481,500 | 228,500 | 14,022 | 255 | 1,667 |
| A | Hot bench call | 3,236 | 3,512 | 91 | 5 | 4 |
| A+X | Hot bench call | 6,423 | 7,141 | 253 | 5 | 4 |
| R | Hot bench call | 13,097 | 13,634 | 668 | 4 | 8 |

| Extra over A | Instructions | Cycles | Cycles per extra instruction |
|---|---|---|---|
| Empty crossing, hot | +3,629 | +3,187 | 0.9 |
| Empty crossing, real message | **+4,100** | **+18,300** | 4.4 |
| Kernel 2, hot | +10,122 | +9,861 | 1.0 |
| Kernel 2, real message | +18,200 | +45,600 | 2.5 |

Three rounds were too few. A first reading of this table claimed the empty crossing takes 5.7 times its hot-loop cycles in a real message, which would make the crossing uniquely slow. Its three per-round deltas were −7,200, +31,500 and +30,600 cycles, so that claim does not hold, and the 20-round run below withdraws it.

### Slimmer glue, 20 rounds

`ts/rust-kernel.ts` then kept one input buffer and its views for the instance's lifetime, rebuilding them only when memory grows, and `ts/wire.ts` wrote ASCII text byte by byte instead of through a `subarray` and `encodeInto` per text. The wasm is unchanged. `test/diff.ts` gained a check that grows the buffer and memory between calls; reusing views across memory growth fails it with a detached-buffer error.

The same probe then ran 20 rounds of A, A+X and R, interleaved. Unrelated load on the homelab during part of the run raised every variant's CPU time in some rounds (A's median user CPU per message was 235 µs, against 145–155 µs when idle), so the table pairs each variant with A in the same round. Median and interquartile range of the paired difference:

| Extra over A, kernel 2 with slimmer glue | Instructions | Cycles | L1 instruction-cache misses | Last-level cache misses |
|---|---|---|---|---|
| Empty crossing, hot bench call | +871 (850–1,054) | +827 (720–967) | +55 | 0 |
| Empty crossing, real message | +1,638 (813–2,477) | +16,900 (−1,150–28,700) | +247 | +22 |
| Kernel 2, hot bench call | **+5,361** (5,343–5,364) | +4,827 (4,761–4,887) | +348 | −2 |
| Kernel 2, real message | **+12,997** (12,375–13,558) | **+31,200** (26,200–40,200) | +854 | +67 |

What the counters show:

1. **The whole message path is stall-bound, not just the crossing.** A real TypeScript message takes 439,000 cycles for 209,000 instructions, 2.1 cycles per instruction, against about 0.9 in the hot loop. Network, JSON, SQLite and the shell leave every part of the path cold.
2. **The Rust kernel's extra instructions cost about what any instruction on that path costs**: 2.4 cycles each, against the path's 2.1, with about 850 more instruction-cache misses and 67 more last-level misses per message. The gap is +6.2% instructions and +7.1% cycles.
3. **An empty crossing's cycles are within noise**: its interquartile range spans zero.
4. **The slimmer glue cut the hot Rust call from +10,122 to +5,361 instructions**, and the real message from about +18,200 to +13,000; the cycle gap fell from about +45,600 (three rounds) to +31,200.
5. **A real message runs about 7,600 more Rust-side instructions than a hot bench call**, explained by the profile below.

### Where the instructions go

A fourth throwaway probe recorded `perf record -e instructions:u` over the same windows, with workerd started with `v8Flags = ["--perf-basic-prof"]` so `perf` can name JIT code, an unminified bundle, and a kernel build that keeps its wasm name section (`wasm-opt -g`; its code differs slightly from the shipped build). Two rounds per variant; totals per message match `perf stat` (A 209,483 and 210,853, R 222,673 and 221,963). R − A per real message:

| Category | Round 1 | Round 2 | Stable? |
|---|---|---|---|
| Rust kernel (wasm) | +5,270 | +5,220 | Yes |
| JavaScript shell and glue | +2,620 | +2,760 | Yes |
| workerd and kj | +1,310 | +1,230 | Yes |
| V8 runtime and GC | −890 | −1,590 | Yes |
| V8 compiler (JIT compiling inside the window) | −160 | +5,220 | No |
| V8 builtins | +4,950 | −2,680 | No |
| Allocator, zlib, SQLite, other native | +330 | −1,140 | No: identical code in both variants |

The Rust path itself, kernel plus glue, costs about **7,900 instructions per real message**, in both rounds. Its largest functions:

| Function | Per real message | Per bench call | Why |
|---|---|---|---|
| `BTreeMap::insert` (unacked events) | 1,140 | 102 | The probe never acknowledges, so the map holds 22,000 events; in the bench each publish is acknowledged at once |
| `step`: batch decode and output encoding, inlined | 1,100 | 1,052 | Per call; the same in both |
| JavaScript `Writer.text`, the ASCII loop | 740 | under 100 | One `DataView.setUint8` per character; real keys and events are 18 characters against the bench's 8 |
| `Mailbox::publish` | 680 | 348 | The bench averages publishes with cheaper acks and duplicates |
| JavaScript `handle`, `run`, `effect`, `perform`, `deliver`, `decodeOutputs` | about 1,600 | about 930 | Three effects per publish, against fewer per average bench call |
| `wire::Reader::text` | 395 | 235 | UTF-8 checks and an `Rc<str>` for longer texts |
| `KeySet::grow` | 250 | under 74 | One rehash of the 16,384-slot table fell inside the window, amortized |
| dlmalloc | about 225 | about 340 | Allocations for texts and effect lists |

So the "7,600 more than a hot call" was mostly a comparison artifact. A real message is always a publish with three effects, longer texts and, in this probe, a large unacknowledged map. A bench call is an average over publishes, acknowledgements and duplicates. The levers it points to:

- **Unacknowledged events in a sequence-indexed ring instead of a `BTreeMap`**: sequence numbers only grow, so an acknowledged slot can be found by `seq − base`. The `BTreeMap` cost grows with the number of unacknowledged events.
- **Write ASCII through a `Uint8Array` instead of `DataView.setUint8`**, or switch to `encodeInto` above a length.
- **Batch messages that arrive together** to share `step`'s per-call 1,100 instructions.

Separately, both variants spend about 35,000 instructions per message, 17%, in zlib: the WebSocket connection compresses every frame (permessage-deflate). That is a daemon cost independent of the kernel.

Instructions, not a special crossing penalty, are what to cut. The gap is larger on disk because each message waits longer, which leaves even more of the path cold.

## Fair comparison

Batching and turning compression off help the TypeScript rules as much as the Rust kernel, so `test/counters.ts` applies each change to both. Kernel 3 throughout. On the homelab, tmpfs storage, 10 rounds of 12 runs in rotating order, `counters-raw-linux.jsonl`. Each run warms 1,000 units, then counts 10,000 units, each a publish of a new key followed by the acknowledgement of its sequence number, so no backlog builds up; every reply is checked. Then 300 sequential publishes give round-trip latency. Batch frames carry 16 requests. Compression off uses generated configs with `no_web_socket_compression`; each run records the extension the client negotiated (`permessage-deflate` or none). Median per request, interquartile range of the paired R − A difference:

| Compression | Frames | A cycles | R cycles | R − A cycles | A instructions | R instructions | R − A instructions | p50 A / R, ms |
|---|---|---|---|---|---|---|---|---|
| On (default) | Single | 451,903 | 484,981 | +37,845 (25,750–44,548) | 201,504 | 221,889 | +20,400 (19,169–20,984) | 0.43 / 0.46 |
| On | Batch of 16 | 101,935 | 116,996 | +16,120 (14,773–17,929) | 70,866 | 81,967 | +11,032 (10,903–11,411) | 0.36 / 0.41 |
| On | Coalescing | 259,859 | 262,999 | +5,281 (1,239–15,967) | 153,832 | 164,990 | +11,135 (9,363–12,941) | **2.93 / 2.95** |
| Off | Single | 405,511 | 444,901 | +40,164 (35,381–44,462) | 175,907 | 193,658 | +18,134 (17,074–18,783) | 0.41 / 0.46 |
| Off | Batch of 16 | **84,552** | **99,143** | +14,069 (13,902–17,215) | 55,776 | 66,743 | +11,085 (10,904–11,118) | 0.44 / 0.42 |
| Off | Coalescing | 229,919 | 242,761 | +14,252 (4,924–18,047) | 125,310 | 137,923 | +12,788 (11,290–13,260) | 2.86 / 2.90 |

What it shows:

1. **Batch frames are the largest lever, for both.** Cycles per request fall 77% for the TypeScript rules (451,903 → 101,935) and 76% for the Rust kernel (484,981 → 116,996). WebSocket events, JSON frames, SQLite statements and workerd's per-event work are shared across 16 requests.
2. **Turning compression off saves 10% unbatched and 17% batched, for both.** With both changes, A costs 84,552 cycles per request, 19% of the default single-frame cost.
3. **Coalescing saves 42–46% of cycles but adds about 2.5 ms to every sequential request** (p50 2.9 ms against 0.4 ms), for both. A zero-delay timer in workerd fires late: on the M1, the same shells measured p50 1.69–1.94 ms coalesced against 0.13–0.22 ms direct (600 requests, two rounds). A microtask cannot batch, because workerd runs microtasks at the end of each WebSocket event. The timer's delay was not traced to its source in workerd.
4. **The Rust kernel's extra cost per request is about 11,000 instructions in every batched mode**, against 18,000–20,000 unbatched. Batching shares the per-call part (glue setup, `step`'s batch framing), not the per-request part (encoding inputs, decoding effects into objects, the rules). Because batching shrinks everything else more, the relative gap grows: +8% cycles unbatched, +16–17% batched.
5. **Neither change reverses the ranking.** The TypeScript rules stay cheaper in every cell. Unbatched, the Rust kernel's p50 is higher in most rounds (+67 µs, interquartile range 17–137 µs, with compression); batched and coalesced, the difference is within the rounds' spread.

## Verdict

**Spike 3's conclusion does not carry over.** With the boundary designed for it, a Rust kernel inside workerd meets the daemon's lightness targets, and the costs that remain are small and measured. Kernel 2:

| Target | Result |
|---|---|
| `core` bundle, ≤ 20 KB gzip | **17.9 KB**: passes (kernel 3: 16.6 KB; kernel 1: 18.4 KB; spike 3: 42.6 KB) |
| Daemon bundle, ≤ 42 KB gzip | **Failed as written**: today's 40.9 KB minus the TypeScript `core` (1.9 KB) plus the kernel (16.6–17.9 KB) and its wire glue is about 56–57 KB. The budget has since been retired as a gate (below) |
| Cold start | Equal on macOS (15 ms); +2 ms on the homelab (50 → 52 ms) |
| Idle private memory, ≤ 20 MB | Within the rounds' spread on macOS (7.2–8.5 against 7.3–8.0 MB); +0.3–0.4 MB on the homelab |
| Memory per mailbox, ≤ 1 MB | +15–25 KB per mailbox for the shared instance; about +110 KB (macOS) or +40 KB (homelab) for an instance per object |
| End-to-end latency | p50 within the noise on macOS; about 0.05–0.1 ms higher on the disk-bound homelab (3.25–3.29 → 3.33–3.38 ms) |
| CPU per real message | +3–6% on macOS under background load, +8–10% on the homelab on disk, about +12% on tmpfs (about 19 µs) |
| CPU bench | 2.6–2.7× slower than V8's JIT in batches of 64, 3.7–4.6× unbatched (kernel 1: 5.3× and 5.5–6.4×). The Rust step alone now matches the TypeScript rules on the M1 |
| Memory after the bench | Lower than TypeScript with the shared instance (spike 3: +58 MB RSS); an instance per object holds 70–85 MB more until the garbage collector runs |

Consequences:

1. **Port for the target, not line by line.** Kernel 1's 5× came from a sorted string set, copies of every text and texts sent back to the shell, not from Rust or wasm. Rules written for Rust's ownership model halved the bench without changing behaviour.
2. **Use one instance per isolate**, not one per Durable Object. It needs `close` when a Durable Object is evicted, which workerd does not announce; that is open design work.
3. **The daemon bundle budget gated bytes, while what it protects (cold start, idle memory) passes.** Decided after this spike: the daemon bundle is no longer a gate; `daemon/budgets/measure.ts` reports its size beside the gated cold-start, idle-memory and `core` budgets (`daemon/docs/architecture.md`, "Budgets").
4. **The remaining per-message cost is the Rust path's extra instructions on a stall-bound message path, not the rules.** Hardware counters over 20 paired rounds: +13,000 instructions and +31,200 cycles per message (+6–7%), at about the path's own 2.1 cycles per instruction; see [Slimmer glue, 20 rounds](#slimmer-glue-20-rounds). The Rust path is about 7,900 of those instructions: 5,200 in the kernel and 2,700 in the glue; see [Where the instructions go](#where-the-instructions-go). Kernel 3 replaced the unacknowledged `BTreeMap` and cheapened ASCII writes.
5. **In workerd, Rust can at best tie TypeScript for these rules, never beat it.** Every shell-level saving (batch frames, no compression, coalescing) helps both versions; see [Fair comparison](#fair-comparison). The Rust kernel keeps a per-request cost of about 11,000 instructions for converting inputs and effects that the TypeScript rules never pay, and the rules themselves are a few percent of a message. Natively, with nothing to convert, kernel 2's rules run in 30 ms against TypeScript's 54–58 ms. The case for the Rust kernel is one implementation on every host, native speed and no GC, not speed inside workerd.
6. **For the daemon itself, batch frames are the largest lever measured**: about 4.5× fewer cycles per request for either version, with no added latency. Turning WebSocket compression off saves another 10–17%. Coalescing on a timer saves less and adds about 2.5 ms per request.
7. **The key set's hash is not keyed.** Keys come from clients, so a shipping kernel needs a keyed hash with a seed from the shell, or `hashbrown` with one (a dependency needing approval).

## Why kernel 1 was slow

Throwaway experiments outside the repository, 200,000 unique publishes in batches of 64.

**Not wasm, and not the size-optimised build.** The same Rust built natively ran decode, rules and encode in 101–105 ms, and the rules alone in 87–88 ms, while the TypeScript rules took 49–90 ms. Inside wasm the step took 119–134 ms, so wasm added about 20%. Building with `opt-level = 3` and `wasm-opt -O3` instead of `"z"` and `-Oz` cut the wasm step by 5–10%.

**The rules' data handling.** Each part of one publish, timed alone natively, 200,000 times:

| Part | ms |
|---|---|
| Remembered keys in a `BTreeSet<String>`, look up then insert | **60.6** |
| The same in std's `HashSet<String>` | 17.4 |
| Unacknowledged events in a `BTreeMap<u64, …>` | 11.6 |
| Copying each key and event three times, as the ported rules did | 16.7 |
| The same six values shared as `Rc<str>` instead | 4.2 |
| Allocating the three-effect list | 3.2 |

A `BTreeSet` lookup makes about 18 string comparisons across 200,000 keys, each through a pointer to text elsewhere in memory, and keys like `k10000` and `k10001` match until their last byte. A JavaScript `Set` is a hash table, and the engine caches each string's hash on the string. The TypeScript rules also store one reference to each string where the port made a copy, and leave freeing to a garbage collector that mostly runs outside the timed loop.

**The boundary.** Under Bun, kernel 1 spent 85–96 ms of its 243–258 ms turning effect texts back into JavaScript strings, although every `persist` and `deliver` text was a key or event the shell had just sent.

### Kernel 2, same experiment

| Part, ms | Kernel 1, Bun (macOS) | Kernel 2, Bun (macOS) | Kernel 2, Node (V8, macOS) | Kernel 2, Bun (homelab) |
|---|---|---|---|---|
| Encode inputs into wasm memory | 23–26 | 24–25 | 33 | 88–90 |
| Rust `step` | 119–124 | **55–58** | 67–68 | 229–232 |
| Decode effects | 85–94 | **28–30** | 22–23 | 42–46 |
| **Total** | **242–258** | **120–127** | **128–131** | **399–401** |
| TypeScript rules, called directly | 52–58 | 54–58 | 77–89 | 233–235 |

Natively, with no wasm (a throwaway example on macOS, three runs), kernel 2's rules alone take **29.9–30.2 ms**, against 54–58 ms for the TypeScript rules, and `wire::step` with the byte codec 53–61 ms. Rust is about twice as fast as the TypeScript once nothing crosses into or out of wasm.

The Rust step now takes as long as the TypeScript rules on the M1. What remains is the crossing: encoding inputs and building effect objects, about 50 ms per 200,000 publishes. Bun 1.4.4 on macOS, 1.4.2 on the homelab; Node 26.12.1. The macOS kernel 2 runs were taken after a burst of unrelated load (OrbStack at 720% CPU) had passed; runs during it were discarded.

## Deviations from the retest plan in `docs/uniform-stack.md`

| Plan | Done | Why |
|---|---|---|
| A bump allocator reset after every step | std's dlmalloc, with the input and output buffers reused across calls | A custom global allocator needs `unsafe impl GlobalAlloc`, beyond the approved export attributes. Mailbox state lives in wasm memory, as in spike 3, because the rules hold it there |
| Durable state in the `store` port | Unchanged from spike 3: rules keep remembered keys in memory, SQLite holds the events | Keeps the rules' behaviour identical, so the comparison is about the boundary and language |
| A hash set from a crate | A small dependency-free set in `key_set.rs`, with an unkeyed FNV-1a hash | `hashbrown` would be the kernel's first dependency |
| ESP32 | Not run | Out of the approved scope |
| Pinned nightly toolchain | Stable 1.96.0 | Spike only |
| BeautifulRust `rust-best-practices` skill | Not loaded | The skill loader could not find it; the local policy's lints applied in full |
| Vitest | A plain Bun script with `node:assert` | Spike only, as spike 3 |

## Environment

| Item | macOS | NixOS homelab |
|---|---|---|
| Machine | Apple M1 Max, 32 GB, macOS 15.7 | `macbook-server`, Intel Core i5-2435M (Sandy Bridge, 2.4 GHz), 4 threads, kernel 6.12.82 |
| perf | — | from `nix-shell -p perf`, user-space counters |
| workerd | 1.20261019.1 | 1.20261019.1 |
| Bun | 1.4.4 | 1.4.2, from `nix-shell -p bun` |
| Rust | 1.96.0, wasm-opt 133 | (wasm built on macOS, copied) |
