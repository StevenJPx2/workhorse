// scripts stage tools — the REGISTRY verbs (save + inventory). run_script
// (execution) is an engine built-in (worker/src/flue-session.ts), not here:
// replaying a saved Code Mode program needs the stage's authentic bridge
// props, which a plugin ToolContext can't reach.
import type { ToolFactory } from "@workhorse/api";
import list_scripts from "./list_scripts";
import write_script from "./write_script";

export const scriptsTools: ToolFactory[] = [list_scripts, write_script];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { list_scripts } from "@workhorse/scripts/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { list_scripts, write_script };
