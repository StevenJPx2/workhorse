// browser stage tools — two tools, split on the read/mutate capability line.
//
// `browser` is read-only (open/snapshot/read/screenshot/record);
// `browser_interact` mutates the page (click/fill/press/scroll). The split is
// the capability gate: a read-only stage can be granted the first without the
// second. Both carry `help: true` for their full per-action documentation.
import type { ToolFactory } from "@workhorse/api";
import browser from "./browser";
import browser_interact from "./browser_interact";

export const browserTools: ToolFactory[] = [browser, browser_interact];
