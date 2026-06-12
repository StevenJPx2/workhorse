import type { ScriptT } from "#schema";

import { runScriptTool } from "./run";
import { type WriteScript, writeScriptTool } from "./write";

export type { WriteScript } from "./write";

export function scriptTools(
  scripts: () => readonly ScriptT[],
  write: WriteScript,
) {
  return [runScriptTool(scripts), writeScriptTool(write)];
}
