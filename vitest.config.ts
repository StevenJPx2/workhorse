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
      ],
      thresholds: {
        lines: 97,
        functions: 97,
        branches: 97,
      },
    },
  },
  resolve: {
    conditions: ["bun"],
    alias: {
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
    },
  },
});
