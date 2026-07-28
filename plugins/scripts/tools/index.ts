// scripts stage tools — ONE tool: list + write the fleet's saved programs.
//
// run_script is NOT here: it is an engine built-in (it needs the stage's
// authentic Code Mode bridge props) and is gated separately.
import type { ToolFactory } from "@workhorse/api";
import scripts from "./scripts";

export const scriptsTools: ToolFactory[] = [scripts];
