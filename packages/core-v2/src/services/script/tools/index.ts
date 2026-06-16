import type { ScriptService } from "../service";

import { runScriptTool } from "./run";
import { writeScriptTool } from "./write";

export type { WriteScript } from "./write";

export function scriptTools(service: ScriptService) {
  return [
    runScriptTool(service.list.bind(service)),
    writeScriptTool(service.write),
  ];
}
