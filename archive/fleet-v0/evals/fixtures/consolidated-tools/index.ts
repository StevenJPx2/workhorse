// The REJECTED consolidated tool surface, pinned as a regression baseline.
//
// These four tools (browser + browser_interact + aft + aft_edit, each with an
// `action` picklist) replaced 13 granular tools at commit c3b058a and were
// reverted after measurement: a cheap model scored 88.1% on them versus 100.0%
// on the granular surface, for a saving of ~1170 prompt tokens per turn.
//
// They are kept — not deleted — because the eval that produced that verdict
// needs both surfaces to keep producing it. Delete this fixture and the finding
// becomes a claim in a commit message instead of a test.
//
// Two failure modes it exhibits, both invisible to token arithmetic:
//   1. cross-tool confusion — `fill` and `press` were sent to `browser` instead
//      of `browser_interact`, and that read/mutate split is REQUIRED by the
//      capability gate, so it cannot be merged away to fix the confusion
//   2. action-within-tool confusion — "check for compile errors" chose
//      action:"outline" instead of "inspect", 0/3
//
// Frozen. Only the shared-helper imports were renamed to avoid a collision.

import type { ToolFactory } from "@workhorse/api";
import aft from "./aft";
import aft_edit from "./aft_edit";
import browser from "./browser";
import browser_interact from "./browser_interact";

/** 4 tools: the consolidated surface that lost on accuracy. */
export const consolidatedTools: ToolFactory[] = [browser, browser_interact, aft, aft_edit];
