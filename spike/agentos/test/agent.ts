// Tests 1 and 3: a coding agent (Pi) runs its loop inside an agentOS VM, and the broker is
// its only way out. The host side checks every claim: the broker's request log, the decoy
// server's connection count, and the file the agent's tool wrote inside the VM.
// Usage: node test/agent.ts        (PI_OFFLINE=1 also turns off Pi's own startup requests)
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { type Broker, startBroker, TOOL_COMMAND } from "../src/broker.ts";
import { openVm } from "../src/policy.ts";
import { expect, root } from "./expect.ts";

type Vm = Awaited<ReturnType<typeof openVm>>;

const PI = "/opt/agent/node_modules/@mariozechner/pi-coding-agent/dist/cli.js";
const AGENT_DIR = "/home/agentos/.pi/agent";
const EGRESS_ATTEMPTS = 12;

const stream = (prefix: string) => (chunk: Uint8Array) => process.stderr.write(`${prefix}${new TextDecoder().decode(chunk)}`);

async function testEgress(vm: Vm, broker: Broker, decoyPort: number, decoyConnections: () => number): Promise<void> {
  await vm.filesystem.writeFile("/workspace/egress.mjs", readFileSync(`${root}guest/egress.mjs`));
  const before = broker.requests.length;
  const began = performance.now();
  const egress = await vm.process.exec(`node /workspace/egress.mjs ${broker.port} ${decoyPort}`, {
    output: { capture: "all" },
    timeoutMs: 120_000,
  });
  const attempts = (egress.stdout ?? "")
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as { name: string; reached: boolean; detail: unknown });
  for (const each of attempts) console.log(`  ${each.reached ? "REACHED" : "blocked"}  ${each.name}: ${JSON.stringify(each.detail)}`);
  console.log(`  egress probe took ${Math.round(performance.now() - began)} ms`);
  expect("every egress attempt ran", attempts.length, EGRESS_ATTEMPTS);
  // `localhost` resolves to 127.0.0.1 inside the VM, so it reaches the same exempt port.
  const reached = attempts.filter((each) => each.reached).map((each) => each.name);
  expect("only the broker is reachable", reached, ["broker http", "broker via localhost name"]);
  expect("the broker saw exactly the guest's requests", broker.requests.length - before, reached.length);
  expect("no connection reached the decoy host port", decoyConnections(), 0);
  console.log("PASS test 3: broker-only egress");
}

async function testAgent(vm: Vm, broker: Broker): Promise<void> {
  const models = {
    providers: {
      broker: { baseUrl: `http://127.0.0.1:${broker.port}/v1`, api: "openai-completions", apiKey: "none", models: [{ id: "fake" }] },
    },
  };
  await vm.filesystem.mkdir(AGENT_DIR, { recursive: true });
  await vm.filesystem.writeFile(`${AGENT_DIR}/models.json`, JSON.stringify(models));
  const before = broker.requests.length;
  const began = performance.now();
  // Pi reads piped stdin until 'end'. Guest node never sees 'end' when stdin comes from
  // exec's `stdin` option or `< /dev/null` (agentOS 0.4.6), only from a guest pipe.
  const run = await vm.process.exec(`true | node ${PI} -p --no-session --provider broker --model fake "Write the proof file."`, {
    cwd: "/workspace",
    env: process.env.PI_OFFLINE === "1" ? { PI_OFFLINE: "1" } : {},
    output: { capture: "all" },
    onStderr: stream("[pi stderr] "),
    timeoutMs: 120_000,
  });
  const chats = broker.requests.slice(before).filter((request) => request.path.endsWith("/chat/completions"));
  console.log(`pi exit ${run.exitCode} in ${Math.round(performance.now() - began)} ms; broker saw ${chats.length} chat requests`);
  console.log(`stdout: ${run.stdout?.trim()}`);
  expect("agent exited cleanly", run.exitCode, 0);
  const proof = new TextDecoder().decode(await vm.filesystem.readFile("/workspace/proof.txt"));
  expect("bash tool wrote the proof file inside the VM", proof, "agentos-proof\n");
  expect("two model turns through the broker", chats.length, 2);
  const second = JSON.parse(chats[1]?.body ?? "{}") as { messages?: { role: string; content?: unknown }[] };
  const toolResult = JSON.stringify(second.messages?.find((message) => message.role === "tool")?.content ?? "");
  expect("second turn carries the tool's output", toolResult.includes("agentos-proof"), true);
  expect("final answer reports the tool's output", run.stdout?.includes("tool said:") === true && run.stdout.includes("agentos-proof"), true);
  expect("the guest sent the placeholder key, not a real one", chats[0]?.authorization, "Bearer none");
  console.log(`PASS test 1: Pi ran \`${TOOL_COMMAND}\` through its bash tool, 2 model turns via the broker`);
}

const broker = await startBroker();
let decoyConnections = 0;
const decoy = createServer((socket) => {
  decoyConnections += 1;
  socket.destroy();
});
await new Promise<void>((resolve) => decoy.listen(0, "127.0.0.1", resolve));
const decoyPort = (decoy.address() as AddressInfo).port;

const vm = await openVm({
  roots: [{ guest: "/opt/agent/node_modules", host: `${root}node_modules`, mode: "read" }],
  brokerPort: broker.port,
  environment: { PI_CODING_AGENT_DIR: AGENT_DIR },
  memoryMb: 256,
  maxProcesses: 32,
});

try {
  await testEgress(vm, broker, decoyPort, () => decoyConnections);
  await testAgent(vm, broker);
} finally {
  await vm.dispose();
  await broker.close();
  decoy.close();
}
