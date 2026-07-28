// knowledge stage/chat tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import search_fleet_knowledge from "./search_fleet_knowledge";

export const knowledgeTools: ToolFactory[] = [search_fleet_knowledge];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { search_fleet_knowledge } from "@workhorse/knowledge/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { search_fleet_knowledge };
