// Spike 4: `workhorse mcp <app>` — relay MCP over stdio to the app's HTTP endpoint on the daemon socket.
// Usage: bun relay.ts <socket> <app>
const [socket, app] = process.argv.slice(2);
if (socket === undefined || app === undefined) throw new Error("usage: relay.ts <socket> <app>");

let protocolVersion: string | undefined; // 2025 era: learned from the initialize result, sent as a header.
const write = (line: string) => process.stdout.write(`${line}\n`);

async function forward(line: string): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  // 2026 era: Streamable HTTP requires these body fields mirrored into headers (spec 2026-07-28,
  // "Request Metadata"). Mcp-Param-* headers and Base64 encoding of non-ASCII names are omitted here.
  const message = JSON.parse(line);
  const modernVersion = message?.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  const version = typeof modernVersion === "string" ? modernVersion : protocolVersion;
  if (version !== undefined) headers["mcp-protocol-version"] = version;
  if (typeof modernVersion === "string" && typeof message.method === "string") {
    headers["mcp-method"] = message.method;
    const name = message.params?.name ?? message.params?.uri;
    if (typeof name === "string") headers["mcp-name"] = name;
  }
  const response = await fetch(`http://daemon/mcp/${app}`, { method: "POST", headers, body: line, unix: socket } as RequestInit);
  const body = await response.text();
  if (body === "") return;
  const lines = response.headers.get("content-type")?.startsWith("text/event-stream")
    ? body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
    : [body];
  for (const message of lines) {
    const version = JSON.parse(message)?.result?.protocolVersion;
    if (typeof version === "string") protocolVersion = version;
    write(message);
  }
}

let buffered = "";
for await (const chunk of process.stdin) {
  buffered += chunk.toString();
  let newline = buffered.indexOf("\n");
  while (newline !== -1) {
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (line !== "") forward(line).catch((error) => process.stderr.write(`relay: ${error}\n`));
    newline = buffered.indexOf("\n");
  }
}
