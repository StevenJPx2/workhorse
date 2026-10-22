import type { Message } from "../jsonrpc.ts";

/**
 * One message as one line. JSON.stringify escapes newlines inside strings, so the encoded
 * message is exactly one line.
 */
export function encodeLine(message: Message): string {
  return `${JSON.stringify(message)}\n`;
}
