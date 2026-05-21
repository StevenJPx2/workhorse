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
        // Workspace dependencies
        "workhorse-core",
        // External dependencies
        "@earendil-works/pi-coding-agent",
        "typebox",
      ],
    },
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
});
