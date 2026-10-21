// Spike 4: drive the stdio relay with the MCP SDK's stdio client and measure the relay's memory.
// Usage: bun relay-probe.ts <socket> <command...>
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const [socket, ...command] = process.argv.slice(2);
if (socket === undefined || command.length === 0) throw new Error("usage: relay-probe.ts <socket> <command...>");
const [program, ...args] = command as [string, ...string[]];

const rssMb = (pid: number) => Number(Bun.spawnSync(["ps", "-o", "rss=", "-p", String(pid)]).stdout.toString().trim()) / 1024;

for (const era of ["legacy", "auto"] as const) {
  const transport = new StdioClientTransport({ command: program, args: [...args, socket, "notes"] });
  const client = new Client({ name: "relay-probe", version: "0.0.0" }, { versionNegotiation: { mode: era } });
  await client.connect(transport);
  const pid = transport.pid;
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  const note = await client.callTool({ name: "read", arguments: { path: "todo.md" } });
  const text = (note.content as Array<{ text: string }>)[0]?.text.trim();
  for (let i = 0; i < 200; i += 1) await client.callTool({ name: "read", arguments: { path: "todo.md" } });
  await Bun.sleep(2000);
  const ok = tools.includes("read") && text === "buy milk";
  console.log(`${ok ? "PASS" : "FAIL"} stdio relay (${era} -> ${client.getProtocolEra()}): tools=${tools} note=${text} relayRssAfter200Calls=${pid === null ? "?" : rssMb(pid).toFixed(1)} MB`);
  await client.close();
  if (!ok) process.exit(1);
}
