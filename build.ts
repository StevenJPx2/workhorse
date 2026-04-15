/**
 * Bun build script for Jiratown
 * Builds the CLI for distribution
 */

import { $ } from "bun";
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["./src/cli/index.ts"],
  outdir: "./dist/cli",
  target: "bun",
  format: "esm",
  minify: process.env.NODE_ENV === "production",
  sourcemap: "external",
  plugins: [createSolidTransformPlugin()],
  external: ["better-sqlite3"],
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

await $`chmod +x ./dist/cli/index.js`;

// Copy mcp-server.sh into dist so it's available alongside the bundle
await $`cp ./src/mcp-server.sh ./dist/mcp-server.sh`;
await $`chmod +x ./dist/mcp-server.sh`;

console.log("Build complete! Output: ./dist/cli/index.js");
