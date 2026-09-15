// knowledge stage/chat tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import memory_search from "./memory_search";
import memory_write from "./memory_write";
import search_fleet_knowledge from "./search_fleet_knowledge";

export const knowledgeTools: ToolFactory[] = [search_fleet_knowledge, memory_search, memory_write];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { memory_search } from "@workhorse/knowledge/tools"` and a typo is a
// compile error rather than a silently empty allowlist. The array stays for the
// plugin contract (chat + stage assembly still read it).
export { memory_search, memory_write, search_fleet_knowledge };
