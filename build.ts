/**
 * Bun build script for Jiratown
 * Builds the CLI for distribution
 */

import { $ } from "bun";
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: process.env.NODE_ENV === "production",
  sourcemap: "external",
  plugins: [createSolidTransformPlugin()],
  external: [
    "better-sqlite3",
  ],
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

await $`chmod +x ./dist/index.js`;

console.log("Build complete! Output: ./dist/index.js");