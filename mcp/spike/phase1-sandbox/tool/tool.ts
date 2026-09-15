// Authored in TypeScript, componentized to WebAssembly. The only capability in
// scope is `read-text` from the host — there is no `node:fs`, no `fetch`, no
// ambient filesystem. Every outside effect flows through the host import.
import { readText } from "wrkhse:spike/host-fs";

export function run(path: string): string {
  const text = readText(path);

  return `guest read ${text.length} bytes via host capability`;
}

export function tryEscape(path: string): string {
  try {
    readText(path);

    return "ESCAPED: host returned data for a path it should have denied";
  } catch (err) {
    return `denied by host: ${String(err)}`;
  }
}
