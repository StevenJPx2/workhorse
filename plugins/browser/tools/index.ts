// browser stage tools — stateful agent-browser session, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import browser_act from "./browser_act";
import browser_open from "./browser_open";
import browser_read from "./browser_read";
import browser_record from "./browser_record";
import browser_screenshot from "./browser_screenshot";
import browser_snapshot from "./browser_snapshot";

export const browserTools: ToolFactory[] = [
  browser_open,
  browser_snapshot,
  browser_read,
  browser_act,
  browser_screenshot,
  browser_record,
];
