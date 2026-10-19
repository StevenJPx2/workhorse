// Core shape comparison: drives the three variants (A ts, B rust2, C rust1) on
// plain workerd and appends one JSON line per variant per round to RAW_FILE.
// Usage: ROUNDS=3 RAW_FILE=measure-raw.jsonl bun test/measure.ts
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 8789);
const base = `http://127.0.0.1:${port}`;
const rounds = Number(process.env.ROUNDS ?? 3);
const rawFile = process.env.RAW_FILE ?? `${root}measure-raw.jsonl`;
const benchN = Number(process.env.BENCH_N ?? 200_000);
// VARIANTS=C-rust1 (comma-separated) limits the run to some variants.
const only = process.env.VARIANTS?.split(",");
const variants = [
  { name: "A-ts", config: "config-ts.capnp" },
  { name: "B-rust2", config: "config-rust2.capnp" },
  { name: "C-rust1", config: "config-rust1.capnp" },
].filter((variant) => only === undefined || only.includes(variant.name));

type Proc = ReturnType<typeof Bun.spawn>;

async function start(config: string): Promise<{ proc: Proc; ms: number; dataDir: string }> {
  const dataDir = mkdtempSync(`${tmpdir()}/workerd-measure-`);
  const began = performance.now();
  const proc = Bun.spawn(
    [
      `${root}node_modules/.bin/workerd`,
      "serve",
      `${root}${config}`,
      "--experimental",
      "--directory-path",
      `storage=${dataDir}`,
      "--socket-addr",
      `http=127.0.0.1:${port}`,
    ],
    { cwd: root, stdout: "ignore", stderr: "ignore" },
  );
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) return { proc, ms: performance.now() - began, dataDir };
    } catch {
      // not listening yet
    }
    if (performance.now() - began > 15_000) throw new Error("workerd did not start");
    await Bun.sleep(2);
  }
}

async function stop(run: { proc: Proc; dataDir: string }): Promise<void> {
  run.proc.kill(9);
  await run.proc.exited;
  rmSync(run.dataDir, { recursive: true, force: true });
}

function ps(pid: number, field: "rss" | "time"): string {
  return Bun.spawnSync(["ps", "-o", `${field}=`, "-p", String(pid)]).stdout.toString().trim();
}

const rssMb = (pid: number) => Math.round((Number(ps(pid, "rss")) / 1024) * 10) / 10;

// macOS `ps -o time=` prints [[h:]m:]ss.cc
function cpuSeconds(pid: number): number {
  return ps(pid, "time")
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

async function bench(pid: number) {
  const call = async () => {
    const cpuBefore = cpuSeconds(pid);
    const began = performance.now();
    const body = (await (await fetch(`${base}/bench?n=${benchN}`)).json()) as { checksum: number };
    const wallMs = performance.now() - began;
    return { wallMs, cpuMs: (cpuSeconds(pid) - cpuBefore) * 1000, checksum: body.checksum };
  };
  const warmup = await call();
  const calls = [];
  for (let i = 0; i < 5; i += 1) calls.push(await call());
  return { warmup, calls };
}

function socket(path: string): Promise<{ ws: WebSocket; call: (key: string) => Promise<unknown> }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const pending = new Map<number, (value: unknown) => void>();
  let nextId = 1;
  ws.onmessage = (message) => {
    const frame = JSON.parse(String(message.data));
    if (frame.id !== undefined) pending.get(frame.id)?.(frame.result);
  };
  const call = (key: string) => {
    const id = nextId++;
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: "mailbox.publish", params: { key, event: { id } } }));
    return new Promise((resolve) => pending.set(id, resolve));
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, call });
    ws.onerror = () => reject(new Error(`websocket ${path} failed`));
  });
}

async function touchMailboxes(tag: string): Promise<void> {
  for (let batch = 0; batch < 10; batch += 1) {
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const { ws, call } = await socket(`/mailbox/${tag}-${batch}-${i}`);
        await call("k");
        ws.close();
      }),
    );
  }
}

async function latency(tag: string): Promise<number[]> {
  const { ws, call } = await socket(`/mailbox/${tag}-latency`);
  const samples: number[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const began = performance.now();
    await call(`lat:${i}`);
    samples.push(performance.now() - began);
  }
  ws.close();
  return samples;
}

async function measure(variant: { name: string; config: string }, round: number) {
  const coldStartMs: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const run = await start(variant.config);
    coldStartMs.push(run.ms);
    await stop(run);
  }

  const cpuRun = await start(variant.config);
  await Bun.sleep(2_000);
  const idleMb = rssMb(cpuRun.proc.pid);
  const benchResult = await bench(cpuRun.proc.pid);
  await Bun.sleep(1_000);
  const afterBenchMb = rssMb(cpuRun.proc.pid);
  await stop(cpuRun);

  const ioRun = await start(variant.config);
  await Bun.sleep(2_000);
  const idleMb2 = rssMb(ioRun.proc.pid);
  await touchMailboxes(`r${round}`);
  const after200MailboxesMb = rssMb(ioRun.proc.pid);
  const samples = await latency(`r${round}`);
  await stop(ioRun);

  const ops = 2 * benchN + benchN / 10;
  const wall = benchResult.calls.map((c) => c.wallMs);
  return {
    variant: variant.name,
    round,
    coldStartMs,
    idleMb: [idleMb, idleMb2],
    afterBenchMb,
    after200MailboxesMb,
    bench: { n: benchN, opsPerCall: ops, ...benchResult },
    benchMedianOpsPerSec: Math.round(ops / (median(wall) / 1000)),
    benchMedianUsPerOp: (median(wall) * 1000) / ops,
    latencyMs: { p50: percentile(samples, 50), p95: percentile(samples, 95), max: Math.max(...samples) },
  };
}

for (let round = 0; round < rounds; round += 1) {
  // Rotate the order so no variant always runs first.
  const order = variants.map((_, i) => variants[(i + round) % variants.length]!);
  for (const variant of order) {
    const result = await measure(variant, round);
    appendFileSync(rawFile, `${JSON.stringify(result)}\n`);
    console.log(
      JSON.stringify({
        variant: result.variant,
        round,
        coldMedianMs: median(result.coldStartMs),
        opsPerSec: result.benchMedianOpsPerSec,
        cpuMs: result.bench.calls.map((c) => Math.round(c.cpuMs)),
        checksum: result.bench.calls[0]?.checksum,
        latency: result.latencyMs,
        rss: { idle: result.idleMb, afterBench: result.afterBenchMb, after200: result.after200MailboxesMb },
      }),
    );
  }
}
