/**
 * Snapshot capture functions for TUI testing.
 *
 * @module test/capture
 */

import { $ } from "bun";
import type { Snapshot, HarnessOptions } from "./types.ts";

/**
 * Run the TUI and capture a snapshot.
 *
 * Starts the TUI with `ht`, waits for it to render,
 * takes a snapshot, and returns the snapshot text.
 *
 * @example
 * ```typescript
 * const snapshot = await captureSnapshot({ renderWaitMs: 5000 });
 * console.log(snapshot.text);
 * ```
 */
export async function captureSnapshot(options: HarnessOptions = {}): Promise<Snapshot> {
  const cols = options.cols ?? 120;
  const rows = options.rows ?? 40;

  const result = await $`
    cd ${options.cwd ?? process.cwd()} && (
      sleep ${(options.renderWaitMs ?? 4000) / 1000}
      echo '{"type": "takeSnapshot"}'
      sleep 1
    ) | timeout ${options.timeoutSec ?? 15} ht --size ${cols}x${rows} --subscribe snapshot ${(options.command ?? "bun src/index.tsx").split(" ")} 2>&1 | grep '"type":"snapshot"'
  `.text();

  const match = result.match(/\{.*"type":"snapshot".*\}/);
  if (!match) {
    throw new Error(`Failed to capture snapshot. Raw output:\n${result}`);
  }

  const event = JSON.parse(match[0]) as {
    type: string;
    data: { cols: number; rows: number; text: string; seq: string };
  };

  return {
    cols: event.data.cols,
    rows: event.data.rows,
    text: event.data.text,
    seq: event.data.seq,
  };
}

/**
 * Run the TUI, send keys, and capture a snapshot.
 *
 * @example
 * ```typescript
 * const snapshot = await captureWithKeys({
 *   keys: ["Tab", "Tab", "Enter"],
 *   renderWaitMs: 3000,
 *   postKeysWaitMs: 1000,
 * });
 * ```
 */
export async function captureWithKeys(
  options: HarnessOptions & {
    keys: string[];
    postKeysWaitMs?: number;
  },
): Promise<Snapshot> {
  const cols = options.cols ?? 120;
  const rows = options.rows ?? 40;

  const result = await $`
    cd ${options.cwd ?? process.cwd()} && (
      sleep ${(options.renderWaitMs ?? 4000) / 1000}
      echo '${JSON.stringify({ type: "sendKeys", keys: options.keys })}'
      sleep ${(options.postKeysWaitMs ?? 1000) / 1000}
      echo '{"type": "takeSnapshot"}'
      sleep 1
    ) | timeout ${options.timeoutSec ?? 20} ht --size ${cols}x${rows} --subscribe snapshot ${(options.command ?? "bun src/index.tsx").split(" ")} 2>&1 | grep '"type":"snapshot"'
  `.text();

  const match = result.match(/\{.*"type":"snapshot".*\}/);
  if (!match) {
    throw new Error(`Failed to capture snapshot. Raw output:\n${result}`);
  }

  const event = JSON.parse(match[0]) as {
    type: string;
    data: { cols: number; rows: number; text: string; seq: string };
  };

  return {
    cols: event.data.cols,
    rows: event.data.rows,
    text: event.data.text,
    seq: event.data.seq,
  };
}
