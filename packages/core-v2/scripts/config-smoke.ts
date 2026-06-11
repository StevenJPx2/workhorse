#!/usr/bin/env bun
/**
 * Config smoke test.
 *
 * Validates the in-code {@link exampleConfig} against the {@link ResolvedConfig}
 * Zod schema and prints the JSON to stdout, so you can eyeball the config shape.
 * The pass/fail summary goes to stderr, so `… > config.json` captures JSON only.
 *
 * Run it DIRECTLY — `bun run --filter` uses multi-run mode and truncates output:
 *   bun packages/core-v2/scripts/config-smoke.ts        # from the repo root
 *   bun run smoke                                        # from packages/core-v2
 *   bun packages/core-v2/scripts/config-smoke.ts > config.json
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
