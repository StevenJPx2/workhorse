// Fair comparison on Linux: CPU per request for the TypeScript rules (A) and the Rust
// kernel (R) under the same shell changes (single frames, JSON-RPC batch frames, a
// coalescing shell), each with WebSocket compression on and off. Hardware counters
// from `perf stat` (user space) and /proc CPU over the same window, then sequential
// round-trip latency. Appends one JSON line per run to RAW_FILE and prints medians.
// Usage (Linux, perf on PATH): WORKERD=$PWD/bin/workerd ROUNDS=10 bun test/counters.ts
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const root = new URL("..", import.meta.url).pathname;
const workerd = process.env.WORKERD ?? `${root}node_modules/.bin/workerd`;
const rounds = Number(process.env.ROUNDS ?? 10);
const rawFile = process.env.RAW_FILE ?? `${root}counters-raw-linux.jsonl`;
const base = "http://127.0.0.1:8789";
const UNITS = 10_000;
const WARM_UNITS = 1_000;
const BATCH_UNITS = 8;
const LATENCY_SAMPLES = 300;

type Mode = "single" | "batch" | "coalesce";
type Shape = { variant: "A" | "R"; mode: Mode; config: string };

const shapes: Shape[] = [
  { variant: "A", mode: "single", config: "config-ts.capnp" },
  { variant: "R", mode: "single", config: "config-rust.capnp" },
  { variant: "A", mode: "batch", config: "config-ts.capnp" },
  { variant: "R", mode: "batch", config: "config-rust.capnp" },
  { variant: "A", mode: "coalesce", config: "config-ts-coalesce.capnp" },
  { variant: "R", mode: "coalesce", config: "config-rust-coalesce.capnp" },
];

if (process.platform !== "linux") throw new Error("counters.ts needs Linux: perf and /proc");

/** The config as is, or a generated copy that turns WebSocket compression off. */
function configFor(config: string, compression: boolean): string {
  if (compression) return `${root}${config}`;
  const text = readFileSync(`${root}${config}`, "utf8")
    .replaceAll('embed "', 'embed "../')
    .replace(/compatibilityDate = "[^"]+",/, (line) => `${line}\n  compatibilityFlags = ["no_web_socket_compression"],`);
  if (!text.includes("no_web_socket_compression")) throw new Error(`${config} has no compatibilityDate to extend`);
  mkdirSync(`${root}generated`, { recursive: true });
  const path = `${root}generated/${config.replace(".capnp", "-nocompress.capnp")}`;
  writeFileSync(path, text);
  return path;
}

type Worker = { proc: ChildProcess; pid: number; dir: string };

async function start(config: string): Promise<Worker> {
  const dir = mkdtempSync("/dev/shm/kernel-counters-");
  const proc = spawn(workerd, ["serve", config, "--experimental", "--directory-path", `storage=${dir}`], { stdio: "ignore" });
  const began = performance.now();
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      // not listening yet
    }
    if (performance.now() - began > 15_000) throw new Error("workerd did not start");
    await sleep(5);
  }
  if (proc.pid === undefined) throw new Error("workerd did not spawn");
  return { proc, pid: proc.pid, dir };
}

async function stop(worker: Worker): Promise<void> {
  const exited = new Promise((resolve) => worker.proc.once("exit", resolve));
  worker.proc.kill("SIGKILL");
  await exited;
  rmSync(worker.dir, { recursive: true, force: true });
}

type Reply = { id?: number; result?: { status?: string } };

/** A client that counts replies and checks every one is `published` or `acked`. */
class Client {
  private done = 0;
  private target = 0;
  private wake = () => {};
  private bad = 0;

  private constructor(readonly ws: WebSocket) {
    ws.onmessage = (message) => {
      const frame = JSON.parse(String(message.data)) as Reply | Reply[];
      for (const reply of Array.isArray(frame) ? frame : [frame]) {
        if (reply.id === undefined) continue;
        const status = reply.result?.status;
        if (status !== "published" && status !== "acked") this.bad += 1;
        this.done += 1;
      }
      if (this.done >= this.target) this.wake();
    };
  }

  static async open(): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:8789/mailbox/counters`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("websocket failed"));
    });
    return new Client(ws);
  }

  /** Units `from` to `from + count`: each a publish of a new key, then the ack of its seq. */
  async send(mode: Mode, from: number, count: number): Promise<void> {
    this.target = this.done + 2 * count;
    const all = new Promise<void>((resolve) => (this.wake = resolve));
    const requests = Array.from({ length: count }, (_, i) => unit(from + i)).flat();
    if (mode === "batch") {
      for (let at = 0; at < requests.length; at += 2 * BATCH_UNITS) this.ws.send(JSON.stringify(requests.slice(at, at + 2 * BATCH_UNITS)));
    } else {
      for (const request of requests) this.ws.send(JSON.stringify(request));
    }
    await all;
    if (this.bad > 0) throw new Error(`${this.bad} replies were not published or acked`);
  }

  async roundTrip(i: number): Promise<number> {
    this.target = this.done + 1;
    const replied = new Promise<void>((resolve) => (this.wake = resolve));
    const began = performance.now();
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1e9 + i, method: "mailbox.publish", params: { key: `lat:${i}`, event: { i } } }));
    await replied;
    return performance.now() - began;
  }
}

// A fresh mailbox numbers publishes from 1, so unit i's publish gets seq i + 1.
const unit = (i: number) => [
  { jsonrpc: "2.0", id: 2 * i + 1, method: "mailbox.publish", params: { key: `t:${i}`, event: { i } } },
  { jsonrpc: "2.0", id: 2 * i + 2, method: "mailbox.ack", params: { seq: i + 1 } },
];

function procCpu(pid: number): { user: number; sys: number } {
  const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.split(" ") ?? [];
  return { user: Number(fields[11]) * 10_000, sys: Number(fields[12]) * 10_000 };
}

/** perf stat and /proc CPU over `work`, per request; CPU in microseconds. */
async function counted(pid: number, requests: number, work: () => Promise<void>): Promise<Record<string, number>> {
  const out = `/dev/shm/kernel-counters-perf-${pid}.csv`;
  const perf = spawn("perf", ["stat", "-x", ",", "-o", out, "-e", "task-clock,cycles:u,instructions:u", "-p", String(pid)], { stdio: "ignore" });
  await sleep(300);
  const before = procCpu(pid);
  await work();
  const after = procCpu(pid);
  const exited = new Promise((resolve) => perf.once("exit", resolve));
  perf.kill("SIGINT");
  await exited;
  const counts: Record<string, number> = { procUserUs: after.user - before.user, procSysUs: after.sys - before.sys };
  for (const line of readFileSync(out, "utf8").split("\n")) {
    const [value, , event] = line.split(",");
    if (event === undefined || value === undefined || Number.isNaN(Number(value))) continue;
    const name = event.replace(/:u$/, "");
    counts[name === "task-clock" ? "taskClockUs" : name] = name === "task-clock" ? Number(value) * 1000 : Number(value);
  }
  rmSync(out, { force: true });
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.round((value / requests) * 10) / 10]));
}

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)] ?? 0;

async function run(shape: Shape, compression: boolean, round: number) {
  const worker = await start(configFor(shape.config, compression));
  try {
    const client = await Client.open();
    const extensions = client.ws.extensions;
    await client.send(shape.mode, 0, WARM_UNITS);
    const perRequest = await counted(worker.pid, 2 * UNITS, () => client.send(shape.mode, WARM_UNITS, UNITS));
    const samples: number[] = [];
    for (let i = 0; i < LATENCY_SAMPLES; i += 1) samples.push(await client.roundTrip(i));
    client.ws.close();
    const latencyMs = { p50: Math.round(percentile(samples, 50) * 1000) / 1000, p95: Math.round(percentile(samples, 95) * 1000) / 1000 };
    return { round, variant: shape.variant, mode: shape.mode, compression, extensions, perRequest, latencyMs };
  } finally {
    await stop(worker);
  }
}

const results = [];
for (let round = 0; round < rounds; round += 1) {
  const runs = [true, false].flatMap((compression) => shapes.map((shape) => ({ shape, compression })));
  for (let i = 0; i < runs.length; i += 1) {
    const next = runs[(i + round) % runs.length];
    if (next === undefined) continue;
    const result = await run(next.shape, next.compression, round);
    appendFileSync(rawFile, `${JSON.stringify(result)}\n`);
    results.push(result);
  }
  console.log(`round ${round + 1}/${rounds} done`);
}
summarize(results);

function summarize(rows: Awaited<ReturnType<typeof run>>[]): void {
  const median = (values: number[]) => percentile(values, 50);
  for (const compression of [true, false]) {
    for (const mode of ["single", "batch", "coalesce"] as const) {
      const pick = (variant: "A" | "R") => rows.filter((row) => row.variant === variant && row.mode === mode && row.compression === compression);
      const [a, r] = [pick("A"), pick("R")];
      const metric = (set: typeof rows, key: string) => median(set.map((row) => row.perRequest[key] ?? Number.NaN));
      const paired = (key: string) => median(r.map((row) => (row.perRequest[key] ?? 0) - (a.find((other) => other.round === row.round)?.perRequest[key] ?? 0)));
      console.log(
        JSON.stringify({
          compression,
          mode,
          extensions: [...new Set([...a, ...r].map((row) => row.extensions))],
          A: { instructions: metric(a, "instructions"), cycles: metric(a, "cycles"), procUserUs: metric(a, "procUserUs"), p50: median(a.map((row) => row.latencyMs.p50)) },
          R: { instructions: metric(r, "instructions"), cycles: metric(r, "cycles"), procUserUs: metric(r, "procUserUs"), p50: median(r.map((row) => row.latencyMs.p50)) },
          RminusA: { instructions: paired("instructions"), cycles: paired("cycles"), procUserUs: paired("procUserUs") },
        }),
      );
    }
  }
}
