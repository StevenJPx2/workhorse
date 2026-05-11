/**
 * Types for the TUI test harness.
 */

export interface Snapshot {
  cols: number;
  rows: number;
  text: string;
}

export interface HarnessOptions {
  cols?: number;
  rows?: number;
  renderWaitMs?: number;
  timeoutSec?: number;
  command?: string;
  cwd?: string;
}

export interface TestCase {
  name: string;
  assert: (text: string) => true | string;
  keys?: string[];
  options?: HarnessOptions;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  snapshot?: string;
}
