import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
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
        "**/lib/git/worktree/operations.ts", // Git operations - requires real git repo
        "**/lib/git/worktree/utils.ts", // Git utilities with Bun.spawn - requires real git commands
        "**/builtin/tools/implementations.ts", // Tool implementations - tested via integration
      ],
      thresholds: {
        lines: 97,
        functions: 97,
        branches: 95, // Lower than others due to defensive code branches
      },
    },
  },
  resolve: {
    conditions: ["bun"],
    tsconfigPaths: true,
  },
});
