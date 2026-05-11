/**
 * Snapshot capture functions for TUI testing.
 * Uses the `ht` (headless terminal) CLI.
 */

import { $ } from "bun";
import type { Snapshot, HarnessOptions } from "./types.ts";

async function cleanup(name: string): Promise<void> {
  try {
    await $`ht stop ${name} 2>/dev/null`.nothrow();
    await $`ht remove ${name} 2>/dev/null`.nothrow();
  } catch {
    // Ignore cleanup errors
  }
}

async function startSession(options: HarnessOptions): Promise<{ name: string }> {
  const name = `jt-test-${Math.random().toString(36).slice(2, 10)}`;

  const raw =
    await $`ht run --name ${name} --size ${options.cols ?? 120}x${options.rows ?? 40} --json --cwd ${options.cwd ?? process.cwd()} ${(options.command ?? "bun src/index.tsx").split(" ")} 2>&1`.text();

  const match = raw.match(/\{[^{}]*"name"[^{}]*\}/);
  if (!match) {
    throw new Error(`Failed to start ht session. Output:\n${raw}`);
  }

  return { name: (JSON.parse(match[0]) as { name: string }).name };
}

async function takeSnapshot(name: string): Promise<string> {
  return $`ht view ${name} --format plain 2>&1`.text();
}

/**
 * Run the TUI and capture a snapshot.
 */
export async function captureSnapshot(options: HarnessOptions = {}): Promise<Snapshot> {
  const { name } = await startSession(options);

  try {
    await new Promise((r) => setTimeout(r, options.renderWaitMs ?? 4000));
    return {
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      text: await takeSnapshot(name),
    };
  } finally {
    await cleanup(name);
  }
}

/**
 * Run the TUI, send keys, and capture a snapshot.
 */
export async function captureWithKeys(
  options: HarnessOptions & {
    keys: string[];
    postKeysWaitMs?: number;
  },
): Promise<Snapshot> {
  const { name } = await startSession(options);

  try {
    await new Promise((r) => setTimeout(r, options.renderWaitMs ?? 4000));

    await $`ht send ${name} ${options.keys.join(" ")} --wait-idle ${options.postKeysWaitMs ?? 1000}ms 2>&1`
      .nothrow()
      .text();

    return {
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      text: await takeSnapshot(name),
    };
  } finally {
    await cleanup(name);
  }
}
