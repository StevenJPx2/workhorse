import { resolve } from "node:path";

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        // Node built-ins must be external
        /^node:/,
        // Workspace dependencies
        "workhorse-core",
        // External dependencies
        "zod",
        /^zod\//,
      ],
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    dts({
      rollupTypes: true,
      tsconfigPath: "./tsconfig.json",
    }),
  ],
});
