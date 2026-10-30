// Kernel retest: drives each variant on plain workerd, checks behaviour through the
// real runtime, then measures. Appends one JSON line per variant per round to RAW_FILE.
// Usage: ROUNDS=3 bun test/measure.ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const root = new URL("..", import.meta.url).pathname;
// NixOS needs a copy of the binary patched for the store's loader; WORKERD points at it.
const workerd = process.env.WORKERD ?? `${root}node_modules/.bin/workerd`;
const port = 8789;
const base = `http://127.0.0.1:${port}`;
const rounds = Number(process.env.ROUNDS ?? 3);
const rawFile = process.env.RAW_FILE ?? `${root}measure-raw-${process.platform}.jsonl`;
const benchN = 200_000;
const batches = [1, 64];
const pipelined = 20_000;
const only = process.env.VARIANTS?.split(",");
const variants = [
  { name: "A-ts", config: "config-ts.capnp" },
  { name: "R-rust", config: "config-rust.capnp" },
  { name: "RI-rust-instance", config: "config-rust-instance.capnp" },
  { name: "A-ts-coalesce", config: "config-ts-coalesce.capnp" },
  { name: "R-rust-coalesce", config: "config-rust-coalesce.capnp" },
].filter((variant) => only === undefined || only.includes(variant.name));

type Run = { proc: ChildProcess; pid: number; ms: number; dataDir: string };

async function start(config: string, dataDir = mkdtempSync(`${tmpdir()}/kernel-retest-`)): Promise<Run> {
  const began = performance.now();
  const proc = spawn(
    workerd,
    ["serve", `${root}${config}`, "--experimental", "--directory-path", `storage=${dataDir}`],
    { cwd: root, stdio: "ignore" },
  );
  const pid = proc.pid;
  if (pid === undefined) throw new Error("workerd did not spawn");
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) return { proc, pid, ms: performance.now() - began, dataDir };
    } catch {
      // not listening yet
    }
    if (performance.now() - began > 15_000) throw new Error("workerd did not start");
    await sleep(2);
  }
}

async function stop(run: Run, { keepData = false } = {}): Promise<void> {
  const exited = new Promise((resolve) => run.proc.once("exit", resolve));
  run.proc.kill("SIGKILL");
  await exited;
  if (!keepData) rmSync(run.dataDir, { recursive: true, force: true });
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function rssMb(pid: number): number {
  return round1(Number(spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim()) / 1024);
}

// The metric the daemon's budgets gate: macOS phys_footprint, Linux Private_Dirty.
function privateMb(pid: number): number {
  if (process.platform === "linux") {
    const kb = /^Private_Dirty:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"))?.[1];
    return round1(Number(kb) / 1024);
  }
  const out = spawnSync("footprint", ["-p", String(pid)], { encoding: "utf8" }).stdout;
  const [, amount, unit] = /phys_footprint:\s+([\d.]+)\s*(KB|MB|GB)/.exec(out) ?? [];
  const scale = unit === "KB" ? 1 / 1024 : unit === "GB" ? 1024 : 1;
  return round1(Number(amount) * scale);
}

const memory = (pid: number) => ({ privateMb: privateMb(pid), rssMb: rssMb(pid) });

// User + system CPU in seconds: /proc on Linux (10 ms ticks), `ps` on macOS ([[h:]m:]ss.cc).
function cpuSeconds(pid: number): number {
  if (process.platform === "linux") {
    const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.split(" ") ?? [];
    return (Number(fields[11]) + Number(fields[12])) / 100;
  }
  const time = spawnSync("ps", ["-o", "time=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
  return time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
};
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)] ?? 0;

type Frame = { id?: number; result?: { status?: string; seq?: number }; method?: string; params?: { seq?: number } };

type Socket = {
  call(method: string, params: object): Promise<Frame["result"]>;
  /** One JSON-RPC batch frame; resolves with the reply frame's entries in order. */
  batch(requests: { method: string; params: object }[]): Promise<Frame[]>;
  frames: Frame[];
  close(): void;
};

function socket(path: string): Promise<Socket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const pending = new Map<number, (result: Frame["result"]) => void>();
  const pendingBatches = new Map<number, (frames: Frame[]) => void>();
  const frames: Frame[] = [];
  let nextId = 1;
  ws.onmessage = (message) => {
    const frame = JSON.parse(String(message.data)) as Frame | Frame[];
    if (Array.isArray(frame)) {
      const first = frame[0]?.id;
      if (first !== undefined) pendingBatches.get(first)?.(frame);
      return;
    }
    frames.push(frame);
    if (frame.id !== undefined) pending.get(frame.id)?.(frame.result);
  };
  const call = (method: string, params: object) => {
    const id = nextId++;
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise<Frame["result"]>((resolve) => pending.set(id, resolve));
  };
  const batch = (requests: { method: string; params: object }[]) => {
    const first = nextId;
    ws.send(JSON.stringify(requests.map((request) => ({ jsonrpc: "2.0", id: nextId++, ...request }))));
    return new Promise<Frame[]>((resolve) => pendingBatches.set(first, resolve));
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ call, batch, frames, close: () => ws.close() });
    ws.onerror = () => reject(new Error(`websocket ${path} failed`));
  });
}

function expect(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Behaviour through the real runtime: dedup, SQLite persistence across SIGKILL, redelivery, ack.
async function check(config: string): Promise<void> {
  const first = await start(config);
  const before = await socket("/mailbox/check");
  expect("publish", await before.call("mailbox.publish", { key: "k", event: { n: 1 } }), { status: "published", seq: 1 });
  expect("duplicate", await before.call("mailbox.publish", { key: "k", event: {} }), { status: "duplicate" });
  before.close();
  await stop(first, { keepData: true });
  const second = await start(config, first.dataDir);
  const after = await socket("/mailbox/check");
  expect("duplicate after SIGKILL", await after.call("mailbox.publish", { key: "k", event: {} }), { status: "duplicate" });
  expect("redelivered", after.frames.filter((frame) => frame.method === "mailbox.deliver").map((frame) => frame.params?.seq), [1]);
  expect("ack", await after.call("mailbox.ack", { seq: 1 }), { status: "acked", seq: 1 });
  expect("next seq", await after.call("mailbox.publish", { key: "j", event: {} }), { status: "published", seq: 2 });
  const replies = await after.batch([
    { method: "mailbox.publish", params: { key: "b", event: {} } },
    { method: "mailbox.publish", params: { key: "b", event: {} } },
    { method: "mailbox.nope", params: {} },
    { method: "mailbox.ack", params: { seq: 3 } },
  ]);
  expect(
    "batch frame",
    replies.map((reply) => reply.result ?? "error"),
    [{ status: "published", seq: 3 }, { status: "duplicate" }, "error", { status: "acked", seq: 3 }],
  );
  after.close();
  await stop(second, { keepData: true });
  const third = await start(config, second.dataDir);
  const last = await socket("/mailbox/check");
  expect("batch persisted", await last.call("mailbox.publish", { key: "b", event: {} }), { status: "duplicate" });
  // Seq 2 was never acknowledged; seq 3 was, inside the batch frame.
  expect("batch ack persisted", last.frames.filter((frame) => frame.method === "mailbox.deliver").map((frame) => frame.params?.seq), [2]);
  last.close();
  await stop(third);
}

if (process.env.CHECK_ONLY === "1") {
  for (const variant of variants) {
    await check(variant.config);
    console.log(`PASS ${variant.name}: dedup, SIGKILL, redelivery, ack, batch frame, persistence`);
  }
  process.exit(0);
}

async function bench(pid: number, batch: number) {
  const call = async () => {
    const cpuBefore = cpuSeconds(pid);
    const began = performance.now();
    const body = (await (await fetch(`${base}/bench?n=${benchN}&batch=${batch}`)).json()) as { checksum: number };
    return { wallMs: performance.now() - began, cpuMs: (cpuSeconds(pid) - cpuBefore) * 1000, checksum: body.checksum };
  };
  await call();
  const calls = [];
  for (let i = 0; i < 5; i += 1) calls.push(await call());
  const wall = median(calls.map((c) => c.wallMs));
  const ops = 2 * benchN + benchN / 10;
  return {
    batch,
    wallMs: round1(wall),
    cpuMs: median(calls.map((c) => c.cpuMs)),
    opsPerSec: Math.round(ops / (wall / 1000)),
    usPerOp: Math.round(((wall * 1000) / ops) * 1000) / 1000,
    checksums: calls.map((c) => c.checksum),
  };
}

async function touchMailboxes(tag: string): Promise<void> {
  for (let group = 0; group < 10; group += 1) {
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const ws = await socket(`/mailbox/${tag}-${group}-${i}`);
        await ws.call("mailbox.publish", { key: "k", event: {} });
        ws.close();
      }),
    );
  }
}

async function latency(tag: string): Promise<{ p50: number; p95: number }> {
  const ws = await socket(`/mailbox/${tag}-latency`);
  const samples: number[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const began = performance.now();
    await ws.call("mailbox.publish", { key: `lat:${i}`, event: { i } });
    samples.push(performance.now() - began);
  }
  ws.close();
  return { p50: round1(percentile(samples, 50) * 1000) / 1000, p95: round1(percentile(samples, 95) * 1000) / 1000 };
}

async function throughput(pid: number, tag: string) {
  const ws = await socket(`/mailbox/${tag}-throughput`);
  const cpuBefore = cpuSeconds(pid);
  const began = performance.now();
  await Promise.all(Array.from({ length: pipelined }, (_, i) => ws.call("mailbox.publish", { key: `t:${i}`, event: { i } })));
  const wallMs = performance.now() - began;
  const cpuMs = (cpuSeconds(pid) - cpuBefore) * 1000;
  ws.close();
  return { messages: pipelined, wallMs: Math.round(wallMs), cpuMsPer1000: round1((cpuMs / pipelined) * 1000) };
}

async function measure(variant: { name: string; config: string }, round: number) {
  await check(variant.config);
  const coldStartMs: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const run = await start(variant.config);
    coldStartMs.push(run.ms);
    await stop(run);
  }

  const cpuRun = await start(variant.config);
  await sleep(2000);
  const idle = memory(cpuRun.pid);
  const benches = [];
  for (const batch of batches) benches.push(await bench(cpuRun.pid, batch));
  await sleep(1000);
  const afterBench = memory(cpuRun.pid);
  await stop(cpuRun);

  const ioRun = await start(variant.config);
  await sleep(2000);
  const ioIdle = memory(ioRun.pid);
  await touchMailboxes(`r${round}`);
  const after200 = memory(ioRun.pid);
  const latencyMs = await latency(`r${round}`);
  const load = await throughput(ioRun.pid, `r${round}`);
  const afterLoad = memory(ioRun.pid);
  await stop(ioRun);

  return {
    variant: variant.name,
    round,
    platform: process.platform,
    coldStartMs: coldStartMs.map(Math.round),
    memory: { idle, afterBench, ioIdle, after200, afterLoad },
    perMailboxKb: Math.round(((after200.privateMb - ioIdle.privateMb) / 200) * 1024),
    benches,
    latencyMs,
    load,
  };
}

// COLD_ONLY=1: cold starts alone, after flushing and settling the disk, so the
// previous variant's deleted storage cannot slow the next start.
async function coldOnly(): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    for (const variant of variants) {
      spawnSync("sync");
      await sleep(5000);
      const coldStartMs: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const run = await start(variant.config);
        coldStartMs.push(Math.round(run.ms));
        await stop(run);
      }
      const result = { variant: variant.name, round, platform: process.platform, coldOnly: true, coldStartMs };
      appendFileSync(rawFile, `${JSON.stringify(result)}\n`);
      console.log(JSON.stringify(result));
    }
  }
}

if (process.env.COLD_ONLY === "1") {
  await coldOnly();
  process.exit(0);
}

for (let round = 0; round < rounds; round += 1) {
  const order = variants.map((_, i) => variants[(i + round) % variants.length]).filter((v) => v !== undefined);
  for (const variant of order) {
    const result = await measure(variant, round);
    appendFileSync(rawFile, `${JSON.stringify(result)}\n`);
    console.log(JSON.stringify(result));
  }
}
