// The PRE-CONSOLIDATION tool surface, pinned as a baseline fixture.
//
// These files are the real granular tools as they shipped at commit 450cf3f —
// their genuine descriptions and schemas, extracted from git rather than
// paraphrased. That matters: an earlier version of this comparison generated
// the granular descriptions by splitting the consolidated ones, which produced
// a strawman (the model called browser_open for an edit task) and made the
// consolidated surface look better than it had earned.
//
// Only two edits were made: the shared helper imports were renamed to avoid a
// collision, and a `docs` stub was added because `tool()` now requires that
// field. Neither touches the DESCRIPTION or the SCHEMA, which is what the
// model actually sees and what the comparison measures.
//
// This fixture is frozen. It is a historical baseline, not code to maintain —
// if the consolidated tools change, the comparison shows the delta against
// what the granular surface actually was.

import type { ToolFactory } from "@workhorse/api";
import aft_edit from "./aft_edit";
import aft_inspect from "./aft_inspect";
import aft_outline from "./aft_outline";
import aft_search from "./aft_search";
import aft_zoom from "./aft_zoom";
import browser_act from "./browser_act";
import browser_key from "./browser_key";
import browser_open from "./browser_open";
import browser_read from "./browser_read";
import browser_record from "./browser_record";
import browser_screenshot from "./browser_screenshot";
import browser_scroll from "./browser_scroll";
import browser_snapshot from "./browser_snapshot";

/** 13 tools: the surface before consolidation. */
export const granularTools: ToolFactory[] = [
  browser_open,
  browser_snapshot,
  browser_read,
  browser_screenshot,
  browser_record,
  browser_act,
  browser_key,
  browser_scroll,
  aft_outline,
  aft_zoom,
  aft_search,
  aft_inspect,
  aft_edit,
];
