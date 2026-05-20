// For local plugins, import from workhorse-core package
import { definePlugin, useWorkhorse } from "workhorse-core";

export default definePlugin({
  manifest: {
    name: "hello-plugin",
    version: "1.0.0",
    description: "A test local plugin",
  },
  setup() {
    const { hooks } = useWorkhorse();
    console.log("🎉 Hello plugin loaded from .workhorse/plugins!");

    // Register a simple hook listener to prove it's working
    hooks.on("plugin.loaded", ({ name }) => {
      if (name === "hello-plugin") {
        console.log("✅ Hello plugin confirmed working!");
      }
    });
  },
  teardown() {
    console.log("👋 Hello plugin teardown");
  },
});
