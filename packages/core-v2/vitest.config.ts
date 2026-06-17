import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    conditions: ["bun"],
    tsconfigPaths: true,
  },
});
