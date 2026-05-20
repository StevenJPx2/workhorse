/**
 * Test runner functions for TUI testing.
 *
 * @module test/runner
 */

import { captureSnapshot, captureWithKeys } from "./capture.ts";
import type { TestResult, TestCase, HarnessOptions } from "./types.ts";

/**
 * Run a suite of TUI tests.
 *
 * @example
 * ```typescript
 * const results = await runTests([
 *   {
 *     name: "shows header",
 *     assert: (text) => text.includes("Workhorse") || "Missing Workhorse header",
 *   },
 *   {
 *     name: "can navigate with Tab",
 *     keys: ["Tab"],
 *     assert: (text) => text.includes("AGENTS") || "Should show AGENTS after Tab",
 *   },
 * ]);
 * ```
 */
export async function runTests(
  tests: TestCase[],
  defaultOptions: HarnessOptions = {},
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const test of tests) {
    const options = { ...defaultOptions, ...test.options };

    try {
      const snapshot = test.keys
        ? await captureWithKeys({ ...options, keys: test.keys })
        : await captureSnapshot(options);

      const result = test.assert(snapshot.text);

      if (result === true) {
        results.push({ name: test.name, passed: true, snapshot: snapshot.text });
      } else {
        results.push({
          name: test.name,
          passed: false,
          error: typeof result === "string" ? result : "Assertion failed",
          snapshot: snapshot.text,
        });
      }
    } catch (e) {
      results.push({
        name: test.name,
        passed: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}

/**
 * Print test results to console.
 */
export function printResults(results: TestResult[]): void {
  console.log("\n=== TUI Test Results ===\n");

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error}`);
      if (result.snapshot) {
        console.log(`  Snapshot preview (first 500 chars):`);
        console.log(`  ${result.snapshot.slice(0, 500).replace(/\n/g, "\n  ")}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
}
