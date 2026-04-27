import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  test: {
    globals: true,
  },
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      rollupTypes: true,
      tsconfigPath: "./tsconfig.json",
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        // Node builtins
        /^node:/,
        // External dependencies - don't bundle these
        "better-sqlite3",
        "keytar",
        "drizzle-orm",
        "mitt",
        "unctx",
        "zod",
        "defu",
        "smol-toml",
        "retriv",
        "string-ts",
        "typebox",
        "@mariozechner/pi-coding-agent",
      ],
    },
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "#config": resolve(__dirname, "src/config/index.ts"),
      "#context": resolve(__dirname, "src/context/index.ts"),
      "#db": resolve(__dirname, "src/db/index.ts"),
      "#lib/git": resolve(__dirname, "src/lib/git/index.ts"),
      "#lib/hooks": resolve(__dirname, "src/lib/hooks/index.ts"),
      "#plugins": resolve(__dirname, "src/plugins/index.ts"),
      "#services/memory": resolve(__dirname, "src/services/memory/index.ts"),
      "#services/monitor": resolve(__dirname, "src/services/monitor/index.ts"),
      "#workflow/orchestrator": resolve(__dirname, "src/workflow/orchestrator/index.ts"),
      "#workflow/tracker": resolve(__dirname, "src/workflow/tracker/index.ts"),
    },
  },
});
