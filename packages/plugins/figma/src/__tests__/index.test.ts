/**
 * Tests for the Figma plugin definition.
 */

import { describe, expect, it } from "vitest";
import { PluginSymbol } from "workhorse-core";

import { figmaPlugin } from "../index.ts";

describe("figmaPlugin", () => {
  it("is a valid Workhorse plugin", () => {
    expect(figmaPlugin[PluginSymbol]).toBe(true);
  });

  it("has the correct manifest name and version", () => {
    expect(figmaPlugin.manifest.name).toBe("figma");
    expect(figmaPlugin.manifest.version).toBe("1.0.0");
  });

  it("declares the expected capabilities (tools only, no parsers or monitors)", () => {
    // Figma URLs are design references, not tasks — no parser needed
    // Monitors were removed since they only worked for "figma" source issues
    expect(figmaPlugin.manifest.capabilities).toEqual({
      tools: ["figma_get_file", "figma_get_comments", "figma_post_comment"],
    });
  });

  it("has a setup function", () => {
    expect(typeof figmaPlugin.setup).toBe("function");
  });

  it("has a teardown function", () => {
    expect(typeof figmaPlugin.teardown).toBe("function");
  });
});
