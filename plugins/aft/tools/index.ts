// aft stage tools — two tools, split on the read/write capability line.
//
// `aft` is read-only (outline/zoom/search/inspect); `aft_edit` writes. The
// split is the capability gate: a read-only stage gets full code intelligence
// with no power to modify the tree. Both carry `help: true`.
import type { ToolFactory } from "@workhorse/api";
import aft from "./aft";
import aft_edit from "./aft_edit";

export const aftTools: ToolFactory[] = [aft, aft_edit];
