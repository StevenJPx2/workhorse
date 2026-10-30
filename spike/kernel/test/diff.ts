// Correctness gate: the Rust kernel, through the real wasm build and the binary
// wire format, must return exactly the TypeScript rules' effects for generated
// input sequences in random batch sizes, and must refuse malformed batches.
// Usage: bun test/diff.ts
import { deepStrictEqual, ok, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Mailbox, type Input, type Stored } from "../ts/mailbox.ts";
import { RustKernel } from "../ts/rust-kernel.ts";

const SEQUENCES = 300;
const INPUTS_PER_SEQUENCE = 400;

const module = new WebAssembly.Module(readFileSync(new URL("../dist-wasm/kernel.wasm", import.meta.url)));

// mulberry32: a small seeded generator, so every failure reproduces from its seed.
function generator(seed: number): (below: number) => number {
  let state = seed >>> 0;
  return (below) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 2 ** 32) * below);
  };
}

const KEYS = ["a", "b", "tick:1", "tick:2", "é", "😀", "long-key-".repeat(20)];
const EVENTS = ["{}", '{"n":1}', '{"text":"héllo 😀"}'];

function pick<T>(random: (below: number) => number, items: readonly T[]): T {
  const item = items[random(items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

function stored(random: (below: number) => number, seq: number): Stored {
  return { seq, key: `${pick(random, KEYS)}${random(5)}`, event: pick(random, EVENTS), acked: random(2) === 1 };
}

function input(random: (below: number) => number, step: number): Input {
  const now = 1_700_000_000_000 + step * 1000;
  switch (random(12)) {
    case 0:
      return { type: "connect" };
    case 1:
      return { type: "every", interval_ms: 1 + random(60_000), now_ms: now };
    case 2:
      return { type: "tick", now_ms: now };
    case 3: {
      const events = Array.from({ length: random(8) }, (_, i) => stored(random, i * 2 + 1 + random(2)));
      return { type: "restore", events, every_ms: random(2) === 0 ? null : 1 + random(1000) };
    }
    case 4:
    case 5:
    case 6:
      return { type: "ack", seq: random(step + 3) };
    default:
      return { type: "publish", key: `${pick(random, KEYS)}${random(40)}`, event: pick(random, EVENTS) };
  }
}

function sequence(seed: number): void {
  const random = generator(seed);
  const expected = new Mailbox();
  const actual = new RustKernel(module).open();
  let step = 0;
  while (step < INPUTS_PER_SEQUENCE) {
    const batch = Array.from({ length: 1 + random(20) }, () => input(random, (step += 1)));
    deepStrictEqual(actual.handleBatch(batch), batch.map((each) => expected.handle(each)), `seed ${seed}, step ${step}`);
  }
  actual.close();
}

for (let seed = 1; seed <= SEQUENCES; seed += 1) sequence(seed);
console.log(`PASS ${SEQUENCES} sequences of ${INPUTS_PER_SEQUENCE} inputs match the TypeScript rules`);

// Batches of growing events grow the input buffer and the wasm memory between calls,
// which replaces the views the shell keeps over them.
const grower = new RustKernel(module).open();
const reference = new Mailbox();
for (let round = 0; round < 6; round += 1) {
  const event = "x".repeat(1024 << round);
  const batch = Array.from({ length: 64 }, (_, i): Input => ({ type: "publish", key: `g${round}-${i}`, event }));
  deepStrictEqual(grower.handleBatch(batch), batch.map((each) => reference.handle(each)), `growth round ${round}`);
  deepStrictEqual(grower.handle({ type: "connect" }), reference.handle({ type: "connect" }), `connect after round ${round}`);
}
console.log("PASS input buffer and memory growth between calls (events of 1 to 32 KiB)");

const kernel = new RustKernel(module).open();
throws(() => kernel.handle({ type: "publish", key: "x".repeat(64 * 1024 + 1), event: "{}" }), /code -6/);
console.log("PASS text over 64 KiB is refused (TooLong)");

const raw = new WebAssembly.Instance(module, {}).exports;
const { memory, alloc, step } = raw;
ok(memory instanceof WebAssembly.Memory && typeof alloc === "function" && typeof step === "function");
const malformed: [string, number[], number][] = [
  ["truncated count", [1, 0], -2],
  ["unknown tag", [1, 0, 0, 0, 9], -3],
  ["trailing bytes", [0, 0, 0, 0, 7], -8],
  ["batch over the limit", [0xff, 0xff, 0xff, 0xff], -5],
  ["restore flag not 0 or 1", [1, 0, 0, 0, 0, 0, 0, 0, 0, 2], -4],
];
for (const [name, bytes, code] of malformed) {
  const at = Number(alloc(bytes.length));
  new Uint8Array(memory.buffer, at, bytes.length).set(bytes);
  deepStrictEqual(step(1, bytes.length), code, name);
  console.log(`PASS ${name} is refused with ${code}`);
}
deepStrictEqual(step(1, 1 << 20), -1, "length beyond the written buffer");
deepStrictEqual(alloc(16 * 1024 * 1024 + 1), 0, "input over 16 MiB");
console.log("PASS lengths beyond the buffer and inputs over 16 MiB are refused");
