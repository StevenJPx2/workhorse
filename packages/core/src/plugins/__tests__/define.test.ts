import { describe, expect, it } from "vitest";
import { definePlugin } from "../define.ts";

describe("definePlugin", () => {
  it("creates a valid plugin with required fields", () => {
    // @ts-expect-error - testing minimal plugin without setup (type requires setup)
    const plugin = definePlugin({
      manifest: { name: "test-plugin", version: "1.0.0" },
    });

    expect(plugin.manifest.name).toBe("test-plugin");
    expect(plugin.manifest.version).toBe("1.0.0");
    expect(Symbol.for("jiratown.plugin") in plugin).toBe(true);
  });

  it("rejects invalid manifest with empty name", () => {
    expect(() =>
      // @ts-expect-error - testing minimal plugin without setup (type requires setup)
      definePlugin({
        manifest: { name: "", version: "1.0.0" },
      }),
    ).toThrow();
  });

  it("rejects invalid manifest with empty version", () => {
    expect(() =>
      // @ts-expect-error - testing minimal plugin without setup (type requires setup)
      definePlugin({
        manifest: { name: "test", version: "" },
      }),
    ).toThrow();
  });

  it("accepts optional description", () => {
    // @ts-expect-error - testing minimal plugin without setup (type requires setup)
    const plugin = definePlugin({
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      },
    });

    expect(plugin.manifest.description).toBe("A test plugin");
  });

  it("accepts capabilities", () => {
    // @ts-expect-error - testing minimal plugin without setup (type requires setup)
    const plugin = definePlugin({
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        capabilities: {
          parsers: ["jira", "github"],
          monitors: ["jira-comments"],
        },
      },
    });

    expect(plugin.manifest.capabilities?.parsers).toEqual(["jira", "github"]);
    expect(plugin.manifest.capabilities?.monitors).toEqual(["jira-comments"]);
  });
});
