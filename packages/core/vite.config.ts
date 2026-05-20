import { resolve } from "node:path";

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      bundleTypes: true,
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
        // Bun runtime
        "bun",
        /^bun:/,
        // External dependencies - don't bundle these
        "@libsql/client",
        "drizzle-orm",
        "mitt",
        "unctx",
        "zod",
        "defu",
        "smol-toml",
        "retriv",
        /^retriv\//,
        "@huggingface/transformers",
        "onnxruntime-node",
        "string-ts",
        "typebox",
        "@mariozechner/pi-agent-core",
        "@mariozechner/pi-ai",
      ],
    },
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
});
