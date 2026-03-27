/**
 * Bun build script for Jiratown
 * Builds the CLI for distribution
 */

import { $ } from "bun";

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: process.env.NODE_ENV === "production",
  sourcemap: "external",
  external: [
    // Native modules that can't be bundled
    "better-sqlite3",
    // OpenTUI needs to be external for proper JSX handling
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
  ],
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

// Make the output executable
await $`chmod +x ./dist/index.js`;

console.log("Build complete! Output: ./dist/index.js");
