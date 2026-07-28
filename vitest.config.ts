// Root vitest config — one runner for the whole workspace.
//
// `projects` gives each package its own isolated test run (correct root,
// correct resolution) while keeping a single vitest install and a single
// `bun run test` entry point. Adding a package needs no config change: the
// globs pick up any package that has tests.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Istanbul, not v8: fallow's CRAP scoring reads Istanbul-format
    // coverage-final.json, and without it every function is scored as 0%
    // covered — so a modestly branchy function trips the CRAP gate purely for
    // being untested-looking.
    coverage: {
      provider: "istanbul",
      reporter: ["text-summary", "json"],
      reportsDirectory: "coverage",
      // Extension-scoped: a bare `plugins/*/**` also matches .fallowrc.json and
      // package.json, which the instrumenter then tries to parse as source.
      include: ["packages/*/src/**/*.ts", "plugins/*/**/*.ts", "worker/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/test/**", "**/*.d.ts", "evals/**", "ui/**"],
    },
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
      // @workhorse/db is excluded here — it needs workerd + real D1, so it
      // brings its own config (referenced below) rather than running on node.
      {
        test: {
          name: "packages",
          include: ["packages/*/**/__tests__/**/*.test.ts", "packages/*/test/**/*.test.ts"],
          exclude: ["packages/db/**"],
          environment: "node",
        },
      },
      // @workhorse/db — runs INSIDE workerd against a real local D1, because a
      // mocked D1 would accept SQL that SQLite rejects.
      "./packages/db/vitest.config.ts",
      // Worker tests
      {
        test: {
          name: "worker",
          include: ["worker/**/__tests__/**/*.test.ts", "worker/test/**/*.test.ts"],
          environment: "node",
        },
      },
      // Workflow packages: each workflow's discovered graph + tool gating.
      {
        test: {
          name: "workflows",
          include: ["workflows/*/**/__tests__/**/*.test.ts"],
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
