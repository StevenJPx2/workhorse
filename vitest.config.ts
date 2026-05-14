import { defineConfig } from "vitest/config";

const isCI = process.env.CI === "true";

export default defineConfig({
  test: {
    globals: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Integration tests require API tokens - skip in CI, run locally
      ...(isCI ? ["**/integration.test.ts"] : []),
    ],
    coverage: {
      provider: "v8",
      exclude: [
        "**/keychain.ts",
        "**/schema.ts", // Schema definitions - mostly type exports
        "**/database.ts", // Infrastructure code - constructor/close
        "**/db/schema/events.ts", // Schema table definitions
        "**/db/schema/notifications.ts", // Schema table definitions
        "**/db/schema/custom-types.ts", // Drizzle custom type definitions
        "**/__tests__/fixtures/**", // Test fixtures
        "**/bootstrap.ts", // Bootstrap infrastructure with logger plugin
        "**/orchestrator/agent.ts", // Base class with git/fs operations - tested via adapter plugins
      ],
      thresholds: {
        lines: 97,
        functions: 97,
        branches: 95, // Lower than others due to defensive code branches in L2 and null coalescing operators
      },
    },
  },
  resolve: {
    conditions: ["bun"],
    tsconfigPaths: true,
  },
});
