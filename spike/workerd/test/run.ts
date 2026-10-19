// Spike 3 evidence: drives plain workerd through real sockets, kills it with
// SIGKILL, restarts it, and measures memory. Every check prints PASS or FAIL
// with the observed values.
import { rmSync, readdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const dataDir = `${root}data`;
const port = Number(process.env.PORT ?? 8789);
// CONFIG selects the core variant: config-ts.capnp, config-rust2.capnp, or config-rust1.capnp.
const config = process.env.CONFIG ?? "config-rust2.capnp";
// REMOTE_BASE runs the same checks against a deployed Worker. Process control
// (SIGKILL, restart, RSS) only exists locally.
const remote = process.env.REMOTE_BASE;
const base = remote ?? `http://127.0.0.1:${port}`;
const wsBase = base.replace(/^http/, "ws");
const run = Date.now().toString(36);
const logLines: string[] = [];
let failures = 0;
let workerd: ReturnType<typeof Bun.spawn> | undefined;

function check(name: string, pass: boolean, detail: unknown): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    for (const line of decoder.decode(chunk).split("\n")) if (line) logLines.push(line);
  }
}

async function start(): Promise<number> {
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
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  workerd = proc;
  void collect(proc.stdout as ReadableStream<Uint8Array>);
  void collect(proc.stderr as ReadableStream<Uint8Array>);
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) return Math.round(performance.now() - began);
    } catch {
      // not listening yet
    }
    if (performance.now() - began > 15_000) throw new Error("workerd did not start");
    await Bun.sleep(25);
  }
}

async function kill9(): Promise<void> {
  workerd?.kill(9);
  await workerd?.exited;
}

function rssMb(): number {
  const out = Bun.spawnSync(["ps", "-o", "rss=", "-p", String(workerd?.pid)]).stdout.toString();
  return Math.round(Number(out.trim()) / 1024);
}

class Consumer {
  readonly deliveries: { seq: number; key: string }[] = [];
  closed: { code: number; reason: string } | undefined;
  private readonly pending = new Map<number, (value: unknown) => void>();
  private nextId = 1;

  private constructor(private readonly ws: WebSocket) {}

  static async open(target: string): Promise<Consumer> {
    const ws = new WebSocket(`${wsBase}/mailbox/${run}-${target}`);
    const consumer = new Consumer(ws);
    ws.onmessage = (message) => {
      const frame = JSON.parse(String(message.data));
      if (frame.method === "mailbox.deliver") {
        consumer.deliveries.push({ seq: frame.params.seq, key: frame.params.key });
      } else {
        consumer.pending.get(frame.id)?.(frame.result ?? frame.error);
      }
    };
    ws.onclose = (event) => {
      consumer.closed = { code: event.code, reason: event.reason };
    };
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`websocket to ${target} failed`));
    });
    await Bun.sleep(150);
    return consumer;
  }

  call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  seqs(): number[] {
    return this.deliveries.map((delivery) => delivery.seq);
  }

  close(): void {
    this.ws.close();
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function mailboxRules(): Promise<void> {
  const first = await Consumer.open("s1");
  const r1 = await first.call("mailbox.publish", { key: "github:pr42:comment:1", event: { n: 1 } });
  const r2 = await first.call("mailbox.publish", { key: "github:pr42:comment:2", event: { n: 2 } });
  const r3 = await first.call("mailbox.publish", { key: "github:pr42:comment:1", event: { n: 1 } });
  await Bun.sleep(100);
  check("dedupe: same key twice is published once", same([r1, r2, r3], [
    { status: "published", seq: 1 },
    { status: "published", seq: 2 },
    { status: "duplicate" },
  ]), { replies: [r1, r2, r3], delivered: first.seqs() });

  const ack = await first.call("mailbox.ack", { seq: 1 });
  first.close();
  const second = await Consumer.open("s1");
  check("reconnect redelivers only unacked", same(second.seqs(), [2]), { ack, delivered: second.seqs() });
  second.close();

  const restartMs = remote ? undefined : (await kill9(), await start());
  const third = await Consumer.open("s1");
  const again = await third.call("mailbox.publish", { key: "github:pr42:comment:1", event: { n: 1 } });
  const fresh = await third.call("mailbox.publish", { key: "github:pr42:comment:3", event: { n: 3 } });
  check(`${remote ? "after reconnect" : "after SIGKILL"}: unacked survives, acked key still remembered, seq continues`, same(
    { delivered: third.seqs().slice(0, 1), again, fresh },
    { delivered: [2], again: { status: "duplicate" }, fresh: { status: "published", seq: 3 } },
  ), { restartMs, delivered: third.seqs(), again, fresh });

  const fourth = await Consumer.open("s1");
  await Bun.sleep(100);
  check("one consumer: a new consumer replaces the old one", third.closed?.code === 4000 && same(fourth.seqs(), [2, 3]), {
    oldClosed: third.closed,
    newDelivered: fourth.seqs(),
  });
  fourth.close();
}

async function alarms(): Promise<void> {
  const consumer = await Consumer.open("s5");
  await consumer.call("task.every", { interval_ms: 400 });
  await Bun.sleep(1_700);
  const before = consumer.seqs();
  check("alarms: recurring task fires", before.length >= 3 && same(before, [...before].sort((a, b) => a - b)), { delivered: before });
  consumer.close();
  if (!remote) {
    await kill9();
    await Bun.sleep(1_000);
    await start();
  }
  await Bun.sleep(1_500);
  const after = await Consumer.open("s5");
  await Bun.sleep(1_000);
  const seqs = after.seqs();
  const last = before.at(-1) ?? 0;
  check(`alarms keep firing ${remote ? "while no consumer is connected" : "across SIGKILL"}`, seqs.some((seq) => seq > last + 1), { lastBeforeGap: last, deliveredAfter: seqs });
  after.close();
}

async function hibernation(): Promise<void> {
  const consumer = await Consumer.open("s6");
  await consumer.call("mailbox.publish", { key: "h:1", event: {} });
  const restoresBefore = logLines.filter((line) => line.includes("MAILBOX_RESTORED")).length;
  await Bun.sleep(15_000);
  const ack = await consumer.call("mailbox.ack", { seq: 1 });
  const restoresAfter = logLines.filter((line) => line.includes("MAILBOX_RESTORED")).length;
  check("idle socket across eviction window still works", same(ack, { status: "acked", seq: 1 }) && consumer.closed === undefined, {
    ack,
    restoresBefore,
    restoresAfter,
    socketClosed: consumer.closed,
  });
  consumer.close();
}

async function memory(): Promise<void> {
  await Bun.sleep(2_000);
  const idle = rssMb();
  for (let batch = 0; batch < 10; batch += 1) {
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const consumer = await Consumer.open(`load-${batch}-${i}`);
        await consumer.call("mailbox.publish", { key: "k", event: { batch, i } });
        consumer.close();
      }),
    );
  }
  const loaded = rssMb();
  const settleSeconds = Number(process.env.SETTLE_SECONDS ?? 20);
  await Bun.sleep(settleSeconds * 1_000);
  const settled = rssMb();
  check("memory measured", true, { idleMb: idle, after200MailboxesMb: loaded, settleSeconds, settledMb: settled });
}

async function dynamicWorkers(): Promise<void> {
  // Locally a loopback echo; remotely a public echo, since a deployed Worker
  // cannot reach this machine.
  const echo = remote
    ? undefined
    : Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: (request) => Response.json(Object.fromEntries(request.headers)),
      });
  const echoUrl = echo ? `http://127.0.0.1:${echo.port}/` : "https://httpbin.org/headers";
  const response = await fetch(`${base}/dynamic?echo=${encodeURIComponent(echoUrl)}`);
  const text = await response.text();
  void echo?.stop();
  let body: { direct?: string; viaCapability?: { envKeys: string[]; echoed: unknown } } = {};
  try {
    body = JSON.parse(text);
  } catch {
    check("dynamic workers respond", false, { status: response.status, text: text.slice(0, 300) });
    return;
  }
  const echoed = JSON.stringify(body.viaCapability?.echoed ?? {}).toLowerCase();
  check("dynamic worker without outbound cannot fetch", body.direct?.startsWith("blocked:") === true, { direct: body.direct });
  check(
    "dynamic worker reaches the network only through its capability, which adds the secret",
    same(body.viaCapability?.envKeys, ["NET"]) && echoed.includes("bearer daemon-held-secret"),
    body.viaCapability,
  );
}

if (!remote) {
  rmSync(dataDir, { recursive: true, force: true });
  Bun.spawnSync(["mkdir", "-p", dataDir]);
  const coldMs = await start();
  check("cold start", true, { coldStartMs: coldMs });
  await memory();
}
await mailboxRules();
await alarms();
await hibernation();
await dynamicWorkers();
if (!remote) {
  const files = readdirSync(dataDir, { recursive: true }).map(String);
  check("storage is SQLite files on local disk", files.some((file) => file.endsWith(".sqlite")), { files: files.slice(0, 6), count: files.length });
  await kill9();
}
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
const errors = logLines.filter((line) => /error|exception/i.test(line));
if (errors.length > 0) console.log("workerd errors:\n" + errors.slice(0, 10).join("\n"));
process.exit(failures === 0 ? 0 : 1);
