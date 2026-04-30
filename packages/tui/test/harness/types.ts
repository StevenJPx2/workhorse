/**
 * Types for the TUI testing harness.
 *
 * @module test/types
 */

export interface Snapshot {
  cols: number;
  rows: number;
  text: string;
  seq: string;
}

export interface HarnessOptions {
  /** Terminal width in columns (default: 120) */
  cols?: number;
  /** Terminal height in rows (default: 40) */
  rows?: number;
  /** Command to run (default: "bun src/index.tsx") */
  command?: string;
  /** Working directory (default: current directory) */
  cwd?: string;
  /** Time to wait for TUI to render in ms (default: 4000) */
  renderWaitMs?: number;
  /** Overall timeout in seconds (default: 15) */
  timeoutSec?: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  snapshot?: string;
}

export interface TestCase {
  name: string;
  /** Keys to send before snapshot (optional) */
  keys?: string[];
  /** Assertions to run against the snapshot text */
  assert: (text: string) => boolean | string;
  /** Custom options for this test */
  options?: Partial<HarnessOptions>;
}
