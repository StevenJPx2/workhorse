// aft stage tools — bashless code intelligence, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import aft_edit from "./aft_edit";
import aft_inspect from "./aft_inspect";
import aft_outline from "./aft_outline";
import aft_search from "./aft_search";
import aft_zoom from "./aft_zoom";

export const aftTools: ToolFactory[] = [aft_outline, aft_zoom, aft_search, aft_inspect, aft_edit];
