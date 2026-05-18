import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    conditions: ["browser", "bun"],
    alias: {
      "solid-js": "solid-js/dist/solid.js",
    },
    tsconfigPaths: true,
  },
});
