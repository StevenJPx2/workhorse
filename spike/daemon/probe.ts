// Spike 4: black-box checks against a running daemon, from outside its sandbox.
// Usage: bun probe.ts <base> sandbox|open
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [baseArg, mode] = process.argv.slice(2);
if (baseArg === undefined || (mode !== "sandbox" && mode !== "open")) {
  throw new Error("usage: bun probe.ts <base> sandbox|open");
}
const base = realpathSync(baseArg);
const sandboxed = mode === "sandbox";
const root = join(base, "roots", "notes");
const outside = join(base, "outside");
const socket = join(base, "sock", "daemon.sock");

writeFileSync(join(root, "todo.md"), "buy milk\n");
writeFileSync(join(outside, "secret.txt"), "top secret\n");
mkdirSync(join(outside, "nested"), { recursive: true });
for (const [link, target] of [
  ["escape.txt", join(outside, "secret.txt")],
  ["escape-dir", outside],
]) {
  rmSync(join(root, link), { force: true });
  symlinkSync(target, join(root, link));
}
rmSync(join(outside, "written.txt"), { force: true });
rmSync(join(outside, "host.sock"), { force: true });
const host = Bun.serve({ unix: join(outside, "host.sock"), fetch: () => new Response("host") });

const daemon = (path: string, init: RequestInit = {}) =>
  fetch(`http://daemon${path}`, { ...init, unix: socket } as RequestInit);

type Row = { check: string; expected: string; actual: string; detail: string };
const rows: Row[] = [];
const record = (check: string, expected: string, actual: string, detail: unknown) =>
  rows.push({ check, expected, actual, detail: JSON.stringify(detail).slice(0, 140) });
const escape = sandboxed ? "deny" : "allow";

async function read(check: string, path: string, expected: string) {
  const response = await daemon(`/fs/${path}`);
  const body = await response.text();
  record(check, expected, response.status === 200 ? "allow" : "deny", { status: response.status, body: body.slice(0, 60) });
}

const started = performance.now();
while ((await daemon("/health").catch(() => null))?.status !== 200) {
  if (performance.now() - started > 10_000) throw new Error("daemon not healthy within 10 s");
  await Bun.sleep(5);
}

await read("read file in root", "todo.md", "allow");
const put = await daemon("/fs/new.md", { method: "PUT", body: "written by daemon\n" });
record("write file in root", "allow", put.ok && existsSync(join(root, "new.md")) ? "allow" : "deny", { status: put.status });
await read("read symlink -> outside file", "escape.txt", escape);
await read("read through symlinked dir", "escape-dir/secret.txt", escape);
const putEscape = await daemon("/fs/escape-dir/written.txt", { method: "PUT", body: "escaped\n" });
record("write through symlinked dir", escape, existsSync(join(outside, "written.txt")) ? "allow" : "deny", { status: putEscape.status });
await read("dot-dot path", "%2e%2e/%2e%2e/outside/secret.txt", "deny");

const hostSocket = await (await daemon("/host-socket")).json();
record("connect host Unix socket outside grants", escape, hostSocket.outcome === "reached" ? "allow" : "deny", hostSocket.detail);
const net = await (await daemon("/net")).json();
record("outbound HTTPS (example.com)", "allow", net.outcome === "reached" && net.detail === 200 ? "allow" : "deny", net.detail);
const counter = await (await daemon("/counter")).json();
record("Durable Object SQLite on local disk", "allow", counter.hits >= 1 ? "allow" : "deny", counter);

for (const era of ["legacy", "auto"] as const) {
  const client = new Client({ name: "probe", version: "0.0.0" }, { versionNegotiation: { mode: era } });
  const transport = new StreamableHTTPClientTransport(new URL("http://daemon/mcp/notes"), {
    fetch: (url, init) => fetch(url, { ...init, unix: socket } as RequestInit),
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    const note = await client.callTool({ name: "read", arguments: { path: "todo.md" } });
    const escaped = await client.callTool({ name: "read", arguments: { path: "escape.txt" } });
    const text = (result: typeof note) => (result.content as Array<{ text: string }>)[0]?.text.trim();
    record(`MCP over HTTP (${era}): tools/list + read note`, "allow", tools.includes("read") && text(note) === "buy milk" ? "allow" : "deny", { era: client.getProtocolEra(), tools, note: text(note) });
    record(`MCP over HTTP (${era}): read symlink escape`, escape, escaped.isError === true ? "deny" : "allow", { text: text(escaped) });
  } catch (error) {
    record(`MCP over HTTP (${era})`, "allow", "error", String(error));
  } finally {
    await client.close();
  }
}

host.stop(true);
for (const row of rows) {
  const verdict = row.expected === row.actual ? "PASS" : "FAIL";
  console.log(`${verdict} ${row.check}: expected=${row.expected} actual=${row.actual} ${row.detail}`);
}
const failed = rows.filter((row) => row.expected !== row.actual).length;
console.log(failed === 0 ? `ALL PASS (${rows.length})` : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
