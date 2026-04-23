import { definePlugin } from "../../../define.ts";

export default definePlugin({
  manifest: {
    name: "valid-fixture-plugin",
    version: "1.0.0",
    description: "A valid plugin for testing",
  },
  setup(ctx) {
    ctx.hooks.emit("plugin.loaded", { name: "valid-fixture-plugin" });
  },
});
