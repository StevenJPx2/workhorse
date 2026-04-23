import { definePlugin } from "../../../define.ts";

// Plugin exported as named export (not default) - tests the `mod.default ?? mod` branch
export const plugin = definePlugin({
  manifest: {
    name: "named-export-plugin",
    version: "1.0.0",
    description: "Plugin with named export",
  },
  setup() {},
});
