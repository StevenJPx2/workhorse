// Host-side broker: the only network endpoint a guest may reach. Here it plays a scripted
// OpenAI-compatible model so the agent loop runs without a real provider or key. A real
// broker would forward to the provider and add the key by name; the guest never holds it.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type BrokerRequest = { method: string; path: string; authorization: string | undefined; body: string };

export type Broker = { port: number; requests: BrokerRequest[]; close(): Promise<void> };

type ChatMessage = { role: string; content?: unknown };

/** The command the scripted model asks the agent to run through its bash tool. */
export const TOOL_COMMAND = "echo agentos-proof > /workspace/proof.txt && uname -sm && cat /workspace/proof.txt";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("broker: request body over 4 MiB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const chunk = (delta: object, finishReason: string | null) =>
  `data: ${JSON.stringify({ id: "chatcmpl-spike", object: "chat.completion.chunk", created: 0, model: "fake", choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;

const usage = `data: ${JSON.stringify({ id: "chatcmpl-spike", object: "chat.completion.chunk", created: 0, model: "fake", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`;

/** First turn: call bash. After a tool result: answer with that result's text. */
function reply(messages: ChatMessage[]): string {
  const toolResult = messages.findLast((message) => message.role === "tool");
  if (toolResult === undefined) {
    const call = { index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: TOOL_COMMAND }) } };
    return chunk({ role: "assistant", tool_calls: [call] }, null) + chunk({}, "tool_calls") + usage + "data: [DONE]\n\n";
  }
  const text = typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content);
  return chunk({ role: "assistant", content: `tool said: ${text.trim()}` }, null) + chunk({}, "stop") + usage + "data: [DONE]\n\n";
}

export async function startBroker(): Promise<Broker> {
  const requests: BrokerRequest[] = [];
  const server: Server = createServer((request, response) => {
    readBody(request)
      .then((body) => {
        const path = request.url ?? "";
        requests.push({ method: request.method ?? "", path, authorization: request.headers.authorization, body });
        if (request.method !== "POST" || !path.endsWith("/chat/completions")) {
          response.writeHead(404).end();
          return;
        }
        const parsed = JSON.parse(body) as { messages?: ChatMessage[] };
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        response.end(reply(parsed.messages ?? []));
      })
      .catch((error: unknown) => {
        response.writeHead(400).end(String(error));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
