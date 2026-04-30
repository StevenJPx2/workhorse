#!/usr/bin/env bun
/**
 * Build script for Jiratown plugins.
 *
 * Builds all plugins in packages/plugins/* using Vite library mode.
 * Each plugin outputs ES module with TypeScript declarations.
 *
 * Usage:
 *   bun scripts/build-plugins.ts          # Build all plugins
 *   bun scripts/build-plugins.ts jira     # Build specific plugin(s)
 *   bun scripts/build-plugins.ts --watch  # Watch mode (not yet supported)
 *
 * @module scripts/build-plugins
 */

import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";

const PLUGINS_DIR = resolve(import.meta.dir, "../packages/plugins");

interface BuildResult {
  plugin: string;
  success: boolean;
  duration: number;
  error?: string;
}

async function getPluginDirs(): Promise<string[]> {
  const entries = await readdir(PLUGINS_DIR);
  const dirs: string[] = [];

  for (const entry of entries) {
    const fullPath = join(PLUGINS_DIR, entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory() && !entry.startsWith(".")) {
      dirs.push(entry);
    }
  }

  return dirs.sort();
}

async function buildPlugin(pluginName: string): Promise<BuildResult> {
  const pluginDir = join(PLUGINS_DIR, pluginName);
  const start = performance.now();

  try {
    // Check if plugin has vite.config.ts
    const configPath = join(pluginDir, "vite.config.ts");
    const hasConfig = await Bun.file(configPath).exists();

    if (!hasConfig) {
      return {
        plugin: pluginName,
        success: false,
        duration: performance.now() - start,
        error: "Missing vite.config.ts",
      };
    }

    // Run vite build
    const result = await $`bunx vite build`.cwd(pluginDir).quiet();

    if (result.exitCode !== 0) {
      return {
        plugin: pluginName,
        success: false,
        duration: performance.now() - start,
        error: result.stderr.toString(),
      };
    }

    return {
      plugin: pluginName,
      success: true,
      duration: performance.now() - start,
    };
  } catch (error) {
    return {
      plugin: pluginName,
      success: false,
      duration: performance.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function printResult(result: BuildResult): void {
  const status = result.success ? "✓" : "✗";
  const color = result.success ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  const dim = "\x1b[2m";

  console.log(
    `${color}${status}${reset} @jiratown/plugin-${result.plugin} ${dim}(${formatDuration(result.duration)})${reset}`,
  );

  if (!result.success && result.error) {
    console.error(`  ${result.error}`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      parallel: { type: "boolean", short: "p", default: true },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: bun scripts/build-plugins.ts [options] [plugins...]

Options:
  -h, --help       Show this help message
  -p, --parallel   Build plugins in parallel (default: true)

Examples:
  bun scripts/build-plugins.ts          # Build all plugins
  bun scripts/build-plugins.ts jira     # Build only jira plugin
  bun scripts/build-plugins.ts jira github  # Build specific plugins
`);
    process.exit(0);
  }

  const allPlugins = await getPluginDirs();
  const targetPlugins = positionals.length > 0 ? positionals : allPlugins;

  // Validate requested plugins exist
  for (const plugin of targetPlugins) {
    if (!allPlugins.includes(plugin)) {
      console.error(`Error: Plugin "${plugin}" not found`);
      console.error(`Available plugins: ${allPlugins.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`\nBuilding ${targetPlugins.length} plugin(s)...\n`);

  const start = performance.now();
  let results: BuildResult[];

  if (values.parallel) {
    results = await Promise.all(targetPlugins.map(buildPlugin));
  } else {
    results = [];
    for (const plugin of targetPlugins) {
      results.push(await buildPlugin(plugin));
    }
  }

  // Print results
  for (const result of results) {
    printResult(result);
  }

  const totalDuration = performance.now() - start;
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\nBuild complete in ${formatDuration(totalDuration)}`);
  console.log(`  ${successful} succeeded, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Build script failed:", error);
  process.exit(1);
});
