// search stage tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import web_read from "./web_read";
import web_search from "./web_search";

export const searchTools: ToolFactory[] = [web_search, web_read];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { web_read } from "@workhorse/search/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { web_read, web_search };
