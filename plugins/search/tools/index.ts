// search stage tools — ONE tool: web (search + read).
//
// Both actions are read-only worker-side fetches, so no capability split is
// needed. `help: true` documents each action.
import type { ToolFactory } from "@workhorse/api";
import web from "./web";

export const searchTools: ToolFactory[] = [web];
