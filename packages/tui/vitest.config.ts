import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    conditions: ["browser", "bun"],
    alias: {
      "solid-js": path.resolve(
        "../../node_modules/.bun/solid-js@1.9.12/node_modules/solid-js/dist/solid.js",
      ),
    },
    tsconfigPaths: true,
  },
});
