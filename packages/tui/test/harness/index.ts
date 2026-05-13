/**
 * Headless Terminal Testing Harness for Workhorse TUI
 *
 * Uses `ht` (https://github.com/andyk/ht) to run the TUI in a headless terminal
 * and capture snapshots for testing.
 *
 * @module test/harness
 */

export type { Snapshot, HarnessOptions, TestResult, TestCase } from "./types.ts";
export { captureSnapshot, captureWithKeys } from "./capture.ts";
export { runTests, printResults } from "./runner.ts";
