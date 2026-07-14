#!/usr/bin/env bun

const ECHO_SCHEMA = {
  properties: { message: { type: "string" } },
  required: ["message"],
  type: "object",
};

const HANDLERS: Record<
  string,
  (id: number | string, params?: Record<string, unknown>) => void
> = {
  initialize: (id) =>
    send({
      id,
      jsonrpc: "2.0",
      result: {
        capabilities: { tools: {} },
        protocolVersion: "2024-11-05",
        serverInfo: { name: "mock", version: "1" },
      },
    }),
  "tools/call": (id, params) => {
    send({
      id,
      jsonrpc: "2.0",
      result: {
        content: [
          {
            text: String(
              ((params?.arguments ?? {}) as Record<string, unknown>).message ??
                "",
            ),
            type: "text",
          },
        ],
      },
    });
  },
  "tools/list": (id) =>
    send({
      id,
      jsonrpc: "2.0",
      result: {
        tools: [
          {
            description: "Echo the input back.",
            inputSchema: ECHO_SCHEMA,
            name: "echo",
          },
        ],
      },
    }),
};

function send(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let buffer = "";

process.stdin.on("data", (chunk: Buffer) => {
  buffer += chunk.toString("utf8");
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const message = parseLine(line);
    if (!message) {
      continue;
    }

    const handler = HANDLERS[message.method ?? ""];
    if (handler) {
      handler(message.id ?? 0, message.params);
    }
  }
});

function parseLine(line: string):
  | {
      id?: number | string;
      method?: string;
      params?: Record<string, unknown>;
    }
  | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as {
      id?: number | string;
      method?: string;
      params?: Record<string, unknown>;
    };
  } catch {
    return undefined;
  }
}
