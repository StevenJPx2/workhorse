// Test 2: escape probes. The host plants a canary file outside every mount, symlinks to it
// inside a read-only and a read-write mount, a Unix socket server, a secret in its own
// environment, and its pid. The guest tries to reach each (guest/escape.mjs); the host then
// checks the same facts from outside. Also resource limits and isolation between two VMs.
// Usage: node test/probes.ts
import { randomBytes, createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openVm } from "../src/policy.ts";
import { expect, root } from "./expect.ts";

type Vm = Awaited<ReturnType<typeof openVm>>;
type Probe = { name: string; escaped: boolean; detail: unknown };

const token = randomBytes(16).toString("hex");
process.env.CANARY_SECRET = token;
const base = realpathSync(mkdtempSync(join(tmpdir(), "agentos-probes-")));
const canaryPath = join(base, "canary.txt");
const roDir = join(base, "ro");
const rwDir = join(base, "rw");
writeFileSync(canaryPath, `canary ${token}\n`);
mkdirSync(roDir);
mkdirSync(rwDir);
writeFileSync(join(roDir, "readme.txt"), "read-only root\n");
symlinkSync(canaryPath, join(roDir, "escape-link"));
symlinkSync(canaryPath, join(rwDir, "escape-link"));

const hashTree = (dir: string) =>
  createHash("sha256")
    .update(readdirSync(dir).sort().map((name) => {
      const path = join(dir, name);
      return lstatSync(path).isSymbolicLink() ? `${name}->${readlinkSync(path)}` : `${name}:${readFileSync(path, "utf8")}`;
    }).join("\n"))
    .digest("hex");
const roBefore = hashTree(roDir);

let socketConnections = 0;
const socketPath = join(base, "host.sock");
const socketServer = createServer((socket) => {
  socketConnections += 1;
  socket.destroy();
});
await new Promise<void>((resolve) => socketServer.listen(socketPath, resolve));

const policy = {
  roots: [
    { guest: "/mnt/ro", host: roDir, mode: "read" as const },
    { guest: "/mnt/rw", host: rwDir, mode: "read-write" as const },
  ],
  brokerPort: undefined,
  environment: {},
  memoryMb: 128,
  maxProcesses: 16,
};

async function escapeProbes(vm: Vm): Promise<Probe[]> {
  await vm.filesystem.writeFile("/workspace/escape.mjs", readFileSync(`${root}guest/escape.mjs`));
  const args = { canaryPath, canaryToken: token, roMount: "/mnt/ro", rwMount: "/mnt/rw", socketPath, hostPid: process.pid };
  const run = await vm.process.exec(`node /workspace/escape.mjs '${JSON.stringify(args)}'`, { output: { capture: "all" }, timeoutMs: 120_000 });
  expect("guest output never contains the canary", `${run.stdout}${run.stderr}`.includes(token), false);
  return (run.stdout ?? "").trim().split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line) as Probe);
}

async function exec(vm: Vm, command: string, timeoutMs = 30_000) {
  const began = performance.now();
  const result = await vm.process.exec(command, { output: { capture: "all" }, timeoutMs });
  return { ...result, ms: Math.round(performance.now() - began) };
}

async function limitProbes(vm: Vm): Promise<void> {
  const heap = await exec(vm, `node -e "const a=[];for(;;)a.push(new Array(1e6).fill(1))"`);
  console.log(`  heap bomb: exit ${heap.exitCode} in ${heap.ms} ms: ${(heap.stderr ?? "").trim().split("\n").at(-1)?.slice(0, 120)}`);
  expect("heap bomb is stopped", heap.exitCode !== 0, true);
  const buffers = await exec(vm, `node -e "const a=[];for(;;)a.push(Buffer.alloc(16*1024*1024,1))"`);
  console.log(`  ArrayBuffer bomb: exit ${buffers.exitCode} in ${buffers.ms} ms: ${(buffers.stderr ?? "").trim().split("\n").at(-1)?.slice(0, 120)}`);
  expect("ArrayBuffer bomb is stopped", buffers.exitCode !== 0, true);
  const fork = await exec(vm, `node -e "const {spawn}=require('child_process');let ok=0,fail=0;for(let i=0;i<64;i++){try{const c=spawn('sleep',['3']);c.on('error',()=>fail++);ok++}catch{fail++}}setTimeout(()=>console.log(JSON.stringify({ok,fail})),1500)"`);
  const spawned = JSON.parse((fork.stdout ?? "").trim() || "{}") as { ok?: number; fail?: number };
  const started = (spawned.ok ?? 0) - (spawned.fail ?? 0);
  console.log(`  64 spawns against maxProcesses ${policy.maxProcesses}: ${started} started, ${spawned.fail} refused`);
  expect("spawns beyond maxProcesses are refused", started > 0 && started < policy.maxProcesses, true);
  const spin = await exec(vm, `node -e "for(;;){}"`, 3_000);
  console.log(`  CPU spin with a 3 s deadline: exit ${spin.exitCode} after ${spin.ms} ms`);
  expect("CPU spin is killed at its deadline", spin.exitCode !== 0 && spin.ms < 10_000, true);
  const alive = await exec(vm, "echo alive");
  expect("the VM still works after every limit", alive.stdout?.trim(), "alive");
}

async function crossVmProbes(a: Vm): Promise<void> {
  const b = await openVm({ ...policy, roots: [] });
  try {
    await a.filesystem.writeFile("/tmp/a-secret.txt", token);
    await a.filesystem.writeFile("/tmp/server.mjs", `import http from "node:http"; http.createServer((q, s) => s.end("${token}")).listen(4000);`);
    await a.process.spawn("node", ["/tmp/server.mjs"]);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const fromA = new TextDecoder().decode((await a.network.httpRequest({ port: 4000, path: "/" })).body);
    expect("VM A serves its own port", fromA, token);
    const file = await exec(b, "cat /tmp/a-secret.txt 2>&1; true");
    const port = await exec(b, `node -e "fetch('http://127.0.0.1:4000/').then(r=>r.text()).then(t=>console.log(t),e=>console.log('refused',e.cause?.code??e.message))"`);
    console.log(`  VM B reads VM A's file: ${file.stdout?.trim()}\n  VM B fetches VM A's port 4000: ${port.stdout?.trim()}`);
    expect("VM B cannot read VM A's file", `${file.stdout}`.includes(token), false);
    expect("VM B cannot reach VM A's listener", `${port.stdout}`.includes(token), false);
  } finally {
    await b.dispose();
  }
}

const vm = await openVm(policy);
try {
  const probes = await escapeProbes(vm);
  for (const each of probes) console.log(`  ${each.escaped ? "ESCAPED" : "held   "}  ${each.name}: ${JSON.stringify(each.detail)}`);
  expect("every escape probe ran", probes.length, 26);
  expect("no probe escaped", probes.filter((each) => each.escaped).map((each) => each.name), []);
  expect("no connection reached the host unix socket", socketConnections, 0);
  expect("the read-only root is unchanged on the host", hashTree(roDir), roBefore);
  const rwAfter = readdirSync(rwDir).sort().map((name) => {
    const path = join(rwDir, name);
    return lstatSync(path).isSymbolicLink() ? `${name} -> ${readlinkSync(path)}` : name;
  });
  console.log(`  host view of the rw root after the probes: ${rwAfter.join(", ")}`);
  expect("nothing new appeared beside the roots on the host", readdirSync(base).sort(), ["canary.txt", "host.sock", "ro", "rw"]);
  console.log("PASS escape probes");
  await limitProbes(vm);
  console.log("PASS limits");
  await crossVmProbes(vm);
  console.log("PASS isolation between VMs");
} finally {
  await vm.dispose();
  socketServer.close();
  rmSync(base, { recursive: true, force: true });
}
