// Test 4: cold start and memory, agentOS against nono, on Linux. Each round runs in a fresh
// process so the first VM pays for starting the sidecar. Memory is Private_Dirty summed over
// a process tree (/proc/<pid>/smaps_rollup), as the daemon's budgets measure it.
// Usage (Linux, nono and node on PATH): ROUNDS=5 node test/measure.ts
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { startBroker } from "../src/broker.ts";
import { openVm, type Policy } from "../src/policy.ts";
import { root } from "./expect.ts";

const AGENTS = 10;
const SETTLE_MS = 3_000;
const PI_HOST = `${root}node_modules/@mariozechner/pi-coding-agent/dist/cli.js`;
const PI_GUEST = "/opt/agent/node_modules/@mariozechner/pi-coding-agent/dist/cli.js";
const AGENT_DIR = "/home/agentos/.pi/agent";
const IDLE_NODE = "setInterval(() => {}, 1e9)";

if (process.platform !== "linux") throw new Error("measure.ts needs Linux: /proc");

const children = (pid: number): number[] =>
  readdirSync(`/proc/${pid}/task`).flatMap((task) =>
    readFileSync(`/proc/${pid}/task/${task}/children`, "utf8").trim().split(/\s+/).filter(Boolean).map(Number),
  );
const tree = (pid: number): number[] => [pid, ...children(pid).flatMap(tree)];
// RssAnon + RssShmem from /proc/<pid>/status, which every process can read. smaps_rollup's
// Private_Dirty is denied for nono's supervisor; where both are readable they agree within 0.1%.
function privateKb(pid: number): number {
  const status = readFileSync(`/proc/${pid}/status`, "utf8").split("\n");
  const kb = (name: string) => Number(status.find((line) => line.startsWith(name))?.split(/\s+/)[1] ?? Number.NaN);
  const total = kb("RssAnon:") + kb("RssShmem:");
  if (Number.isNaN(total)) throw new Error(`no RssAnon/RssShmem for pid ${pid}`);
  return total;
}
const treeMb = (pids: number[]) => Math.round(pids.flatMap(tree).reduce((sum, pid) => sum + privateKb(pid), 0) / 102.4) / 10;
/** Everything this process started (the sidecar and anything below it), not this process. */
const ownChildrenMb = () => treeMb(children(process.pid));

const elapsed = async (run: () => Promise<unknown>) => {
  const began = performance.now();
  await run();
  return Math.round((performance.now() - began) * 10) / 10;
};

function policyFor(brokerPort: number): Policy {
  return {
    roots: [{ guest: "/opt/agent/node_modules", host: `${root}node_modules`, mode: "read" }],
    brokerPort,
    environment: { PI_CODING_AGENT_DIR: AGENT_DIR, PI_OFFLINE: "1" },
    memoryMb: 256,
    maxProcesses: 32,
  };
}

const modelsJson = (port: number) =>
  JSON.stringify({ providers: { broker: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "none", models: [{ id: "fake" }] } } });

const PI_RPC_ARGS = ["--mode", "rpc", "--no-session", "--provider", "broker", "--model", "fake"];

type Vm = Awaited<ReturnType<typeof openVm>>;

const READY_REQUEST = `${JSON.stringify({ id: "ready", type: "get_state" })}\n`;
const READY_REPLY = '"command":"get_state"';
const READY_TIMEOUT_MS = 180_000;

/** Resolves once `subscribe`'s output contains Pi's RPC reply to `get_state`. */
function replyIn(subscribe: (onText: (text: string) => void) => void, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let seen = "";
    const timer = setTimeout(() => reject(new Error(`${label} did not answer get_state`)), READY_TIMEOUT_MS);
    subscribe((text) => {
      seen += text;
      if (seen.includes(READY_REPLY)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** A guest Pi is ready when it answers an RPC request: its modules are loaded. */
async function guestPiReady(vm: Vm, pid: number): Promise<void> {
  const decoder = new TextDecoder();
  const ready = replyIn((onText) => vm.onProcessOutput(pid, (event) => onText(decoder.decode(event.data))), `guest pi ${pid}`);
  await vm.process.writeStdin(pid, READY_REQUEST);
  await ready;
}

/** How many of these guest processes are still running: an exited agent costs nothing. */
async function running(processes: { vm: Vm; pid: number }[]): Promise<number> {
  let count = 0;
  for (const each of processes) if ((await each.vm.process.get(each.pid)).state === "running") count += 1;
  return count;
}

async function agentOsRound(): Promise<Record<string, number>> {
  const broker = await startBroker();
  const policy = policyFor(broker.port);
  const vms: Vm[] = [];
  const out: Record<string, number> = {};
  try {
    out.coldFirstExecMs = await elapsed(async () => {
      vms.push(await openVm(policy));
      await vms[0]?.process.exec("true");
    });
    const first = vms[0];
    if (first === undefined) throw new Error("no VM");
    await sleep(SETTLE_MS);
    out.memOneVmMb = ownChildrenMb();
    out.guestNodeFirstMs = await elapsed(() => first.process.exec("node -e 0"));
    out.guestNodeWarmMs = await elapsed(() => first.process.exec("node -e 0"));
    await first.filesystem.mkdir(AGENT_DIR, { recursive: true });
    await first.filesystem.writeFile(`${AGENT_DIR}/models.json`, modelsJson(broker.port));
    out.piRunMs = await elapsed(() => first.process.exec(`true | node ${PI_GUEST} -p --no-session --provider broker --model fake "Write the proof file."`, { cwd: "/workspace" }));
    const warm: number[] = [];
    while (vms.length < AGENTS) {
      warm.push(await elapsed(async () => {
        const vm = await openVm(policy);
        vms.push(vm);
        await vm.process.exec("true");
      }));
    }
    out.warmVmFirstExecMs = warm.toSorted((a, b) => a - b)[Math.floor(warm.length / 2)] ?? 0;
    await sleep(SETTLE_MS);
    out.memVmsMb = ownChildrenMb();
    const idle: { vm: Vm; pid: number }[] = [];
    for (const vm of vms) idle.push({ vm, pid: (await vm.process.spawn("node", ["-e", IDLE_NODE])).pid });
    await sleep(SETTLE_MS);
    out.memIdleNodeMb = ownChildrenMb();
    out.idleNodeAlive = await running(idle);
    const pis: { vm: Vm; pid: number }[] = [];
    for (const vm of vms) {
      await vm.filesystem.mkdir(AGENT_DIR, { recursive: true });
      await vm.filesystem.writeFile(`${AGENT_DIR}/models.json`, modelsJson(broker.port));
      const spawned = await vm.process.spawn("node", [PI_GUEST, ...PI_RPC_ARGS], { cwd: "/workspace", streamStdin: true });
      pis.push({ vm, pid: spawned.pid });
    }
    out.piReadyMs = await elapsed(() => Promise.all(pis.map((each) => guestPiReady(each.vm, each.pid))));
    await sleep(SETTLE_MS);
    out.memIdlePiMb = ownChildrenMb();
    out.idlePiAlive = await running(pis);
    return out;
  } finally {
    for (const vm of vms) await vm.dispose().catch(() => undefined);
    await broker.close();
  }
}

// NixOS keeps node in /nix/store, which nono denies unless it is granted.
const nonoArgs = (program: string[]) => ["run", "--silent", "--read", root, "--read", "/nix/store", "--allow", "/tmp", "--", ...program];

async function spawnIdle(count: number, program: string[], settleMs: number): Promise<ChildProcess[]> {
  const procs = Array.from({ length: count }, (_, i) => {
    // A writable Pi config directory per agent, with the same provider as inside agentOS.
    const agentDir = mkdtempSync(`/tmp/spike-agentos-pi-${i}-`);
    writeFileSync(`${agentDir}/models.json`, modelsJson(1));
    const env = { ...process.env, PI_OFFLINE: "1", PI_CODING_AGENT_DIR: agentDir };
    return spawn("nono", nonoArgs(program), { stdio: ["pipe", "pipe", "ignore"], env });
  });
  await sleep(settleMs);
  return procs;
}

/** A sandboxed Pi is ready when it answers an RPC request, as inside agentOS. */
async function hostPiReady(child: ChildProcess): Promise<void> {
  const ready = replyIn((onText) => child.stdout?.on("data", (chunk: Buffer) => onText(chunk.toString("utf8"))), `nono pi ${child.pid}`);
  child.stdin?.write(READY_REQUEST);
  await ready;
}

const cmdline = (pid: number) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
};

/** Sandboxes whose supervisor still has its child running. (Pi renames its process to `pi`,
 * so command lines cannot identify it; readiness over RPC already proved it started.) */
const alive = (procs: ChildProcess[]) => procs.filter((each) => tree(each.pid ?? 0).length > 1).length;

/** SIGKILL to nono alone orphans the sandboxed child, so kill the whole tree. */
function killTrees(procs: ChildProcess[]): void {
  for (const pid of procs.flatMap((each) => tree(each.pid ?? 0))) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

async function nonoRound(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const run = (command: string, args: string[]) => {
    const began = performance.now();
    const result = spawnSync(command, args, { stdio: "ignore" });
    if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
    return Math.round((performance.now() - began) * 10) / 10;
  };
  const node = process.execPath;
  out.hostNodeMs = run(node, ["-e", "0"]);
  out.nonoNodeMs = run("nono", nonoArgs([node, "-e", "0"]));
  const idle = await spawnIdle(AGENTS, [node, "-e", IDLE_NODE], SETTLE_MS * 3);
  out.memIdleNodeMb = treeMb(idle.map((each) => each.pid ?? 0));
  out.idleNodeAlive = alive(idle);
  killTrees(idle);
  const pi = await spawnIdle(AGENTS, [node, PI_HOST, ...PI_RPC_ARGS], 0);
  out.piReadyMs = await elapsed(() => Promise.all(pi.map(hostPiReady)));
  await sleep(SETTLE_MS);
  out.memIdlePiMb = treeMb(pi.map((each) => each.pid ?? 0));
  out.idlePiAlive = alive(pi);
  killTrees(pi);
  for (const name of readdirSync("/tmp").filter((each) => each.startsWith("spike-agentos-pi-"))) {
    rmSync(`/tmp/${name}`, { recursive: true, force: true });
  }
  return out;
}

if (process.env.ROUND_CHILD === "1") {
  const result = { agentOs: await agentOsRound(), nono: await nonoRound() };
  console.log(JSON.stringify(result));
  process.exit(0);
}

const rounds = Number(process.env.ROUNDS ?? 5);
const rawFile = process.env.RAW_FILE ?? `${root}measure-raw-linux.jsonl`;
for (let round = 0; round < rounds; round += 1) {
  const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { env: { ...process.env, ROUND_CHILD: "1" }, encoding: "utf8", timeout: 600_000 });
  const line = child.stdout.trim().split("\n").findLast((each) => each.startsWith("{"));
  if (child.status !== 0 || line === undefined) throw new Error(`round ${round} failed: ${child.stderr.slice(-2000)}`);
  const leftover = readdirSync("/proc").filter((entry) => /^\d+$/.test(entry)).map(Number).filter((pid) => {
    const args = cmdline(pid);
    // Pi sets process.title, so a leftover Pi shows as "pi", not by its script path.
    return args.trim() === "pi" || args.includes("setInterval(() => {}, 1e9)") || args.includes("pi-coding-agent/dist/cli.js") || args.includes("agentos-native-sidecar");
  });
  if (leftover.length > 0) throw new Error(`round ${round} left ${leftover.length} processes running: ${leftover.join(" ")}`);
  appendFileSync(rawFile, `${JSON.stringify({ round, ...JSON.parse(line) })}\n`);
  console.log(`round ${round + 1}/${rounds}: ${line}`);
}
