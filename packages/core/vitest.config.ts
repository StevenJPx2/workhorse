import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      exclude: [
        "**/keychain.ts",
        "**/schema.ts",
        "**/database.ts",
        "**/db/schema/events.ts",
        "**/db/schema/notifications.ts",
        "**/db/schema/custom-types.ts",
        "**/__tests__/fixtures/**",
        "**/bootstrap.ts",
        "**/orchestrator/agent.ts",
        "**/lib/git/worktree/operations.ts",
        "**/lib/git/worktree/utils.ts",
        "**/builtin/tools/implementations.ts",
      ],
      thresholds: {
        lines: 97,
        functions: 97,
        branches: 95,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
