// scripts stage tools — agent self-extension, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import list_scripts from "./list_scripts";
import run_script from "./run_script";
import write_script from "./write_script";

export const scriptsTools: ToolFactory[] = [list_scripts, run_script, write_script];
