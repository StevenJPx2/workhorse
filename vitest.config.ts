import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 97,
        functions: 97,
        branches: 97,
      },
    },
  },
  resolve: {
    conditions: ["bun"],
  },
});
