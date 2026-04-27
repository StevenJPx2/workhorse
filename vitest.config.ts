import { defineConfig } from "vitest/config";
import path from "node:path";

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
    alias: {
      "@jiratown/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "#config": path.resolve(__dirname, "packages/core/src/config/index.ts"),
      "#types": path.resolve(__dirname, "packages/core/src/types/index.ts"),
      "#lib/hooks": path.resolve(__dirname, "packages/core/src/lib/hooks/index.ts"),
      "#context": path.resolve(__dirname, "packages/core/src/context/index.ts"),
      "#plugins": path.resolve(__dirname, "packages/core/src/plugins/index.ts"),
      "#db": path.resolve(__dirname, "packages/core/src/db/index.ts"),
      "#services/memory": path.resolve(__dirname, "packages/core/src/services/memory/index.ts"),
      "#services/monitor": path.resolve(__dirname, "packages/core/src/services/monitor/index.ts"),
      "#issue-provider": path.resolve(__dirname, "packages/core/src/issue-provider/index.ts"),
      "#agent-adapter": path.resolve(__dirname, "packages/core/src/agent-adapter/index.ts"),
      "#mcp-server": path.resolve(__dirname, "packages/core/src/mcp-server/index.ts"),
      "#workflow/tracker": path.resolve(__dirname, "packages/core/src/workflow/tracker/index.ts"),
      "#workflow/orchestrator": path.resolve(
        __dirname,
        "packages/core/src/workflow/orchestrator/index.ts",
      ),
      "#lib/git": path.resolve(__dirname, "packages/core/src/lib/git/index.ts"),
    },
  },
});
