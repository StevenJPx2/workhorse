// Root vitest config — one runner for the whole workspace.
//
// `projects` gives each package its own isolated test run (correct root,
// correct resolution) while keeping a single vitest install and a single
// `bun run test` entry point. Adding a package needs no config change: the
// globs pick up any package that has tests.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // Colocated tool tests: plugins/<name>/tools/__tests__/*.test.ts
      {
        test: {
          name: "plugins",
          include: ["plugins/*/**/__tests__/**/*.test.ts"],
          environment: "node",
        },
      },
      // Package tests: packages/<name>/{src,test}/**
      {
        test: {
          name: "packages",
          include: ["packages/*/**/__tests__/**/*.test.ts", "packages/*/test/**/*.test.ts"],
          environment: "node",
        },
      },
      // Worker tests
      {
        test: {
          name: "worker",
          include: ["worker/**/__tests__/**/*.test.ts", "worker/test/**/*.test.ts"],
          environment: "node",
        },
      },
      // Model-driven evals: live-model tool-choice scoring. The scored cases
      // self-skip without TOOL_SURFACE_EVAL=1, so the structural assertions
      // still run in normal CI.
      {
        test: {
          name: "evals",
          include: ["evals/**/*.eval.test.ts"],
          environment: "node",
          testTimeout: 600_000,
        },
      },
    ],
  },
});
