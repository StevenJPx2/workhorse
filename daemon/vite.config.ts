import { defineConfig } from "vite-plus";

// Vendored lint policy keeps upstream formatting and is not linted as our code.
const vendored = "tools/oxlint/anti-slop/**";

// tsc and effect-tsgo are Go binaries. Automatic file tracking missed a new
// source file for them, replaying a stale pass, so their inputs are explicit.
const typeInputs = ["**/*.ts", "**/tsconfig*.json", "bun.lock", "!node_modules/**"];

export default defineConfig({
  fmt: {
    ignorePatterns: [vendored],
  },
  lint: {
    ignorePatterns: [vendored],
    plugins: ["typescript", "unicorn", "oxc", "import"],
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
    },
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
      { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop/effect/index.ts" },
    ],
    options: { typeAware: true, typeCheck: true, denyWarnings: true },
    rules: {
      "max-lines-per-function": ["error", { max: 70, skipBlankLines: true, skipComments: true }],
      "typescript/no-explicit-any": "error",
      "typescript/no-non-null-assertion": "error",
      "vite-plus/prefer-vite-plus-imports": "error",

      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",

      "anti-slop-effect/no-manual-effect-error-tag": "error",
      "anti-slop-effect/no-manual-tag-comparison": "error",
      "anti-slop-effect/no-manual-tagged-construction": "error",
      "anti-slop-effect/no-service-constructor-imports": "error",
      "anti-slop-effect/prefer-effect-match": "error",
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "anti-slop",
          include: ["tools/oxlint/anti-slop/**/*.test.ts"],
          setupFiles: ["tools/vitest/rule-tester.ts"],
        },
      },
    ],
  },
  run: {
    tasks: {
      // `vp check` type-checks only linted files; this covers the whole project, vendored code included.
      // --force: tsc's own up-to-date check compares mtimes and skipped a new file with an older mtime.
      types: { command: "tsc -b --force", cache: { input: typeInputs, output: [] } },
      effect: {
        command: "effect-tsgo diagnostics --project tools/tsconfig.json --strict",
        cache: { input: typeInputs, output: [] },
      },
      // Compares against the merge base, so a cached result could be stale.
      health: { command: "fallow audit", cache: false },
      // Reads the live advisory database.
      audit: { command: "bun audit", cache: false },
    },
  },
});
