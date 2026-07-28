// browser stage tools — stateful agent-browser session, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import browser_act from "./browser_act";
import browser_key from "./browser_key";
import browser_open from "./browser_open";
import browser_read from "./browser_read";
import browser_record from "./browser_record";
import browser_screenshot from "./browser_screenshot";
import browser_scroll from "./browser_scroll";
import browser_snapshot from "./browser_snapshot";

export const browserTools: ToolFactory[] = [
  browser_open,
  browser_snapshot,
  browser_read,
  browser_act,
  browser_key,
  browser_scroll,
  browser_screenshot,
  browser_record,
];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { browser_act } from "@workhorse/browser/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { browser_act, browser_key, browser_open, browser_read, browser_record, browser_screenshot, browser_scroll, browser_snapshot };
