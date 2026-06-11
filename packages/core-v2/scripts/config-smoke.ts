#!/usr/bin/env bun
/**
 * Config smoke test.
 *
 * Validates the in-code {@link exampleConfig} against the {@link ResolvedConfig}
 * Zod schema and prints the resulting JSON, so you can eyeball the config shape.
 * JSON goes to stdout and the pass/fail summary to stderr, so you can capture
 * just the shape: `bun run --filter core-v2 smoke > config.json`.
 *
 * Usage:
 *   bun run --filter core-v2 smoke
 *   bun packages/core-v2/scripts/config-smoke.ts
 */
import z from "zod";

import { exampleConfig } from "../src/config/example";
import { ResolvedConfig } from "../src/config/resolved";

const result = ResolvedConfig.safeParse(exampleConfig);

if (!result.success) {
  console.error("✗ example config failed validation:\n");
  console.error(z.prettifyError(result.error));
  process.exit(1);
}

const config = result.data;
console.log(JSON.stringify(config, undefined, 2));

const workflows = Object.keys(config.workflows);
const presets = Object.keys(config.presets);
console.error(
  `\n✓ valid — ${workflows.length} workflow(s) [${workflows.join(", ")}], ` +
    `${presets.length} preset(s) [${presets.join(", ")}]`,
);
