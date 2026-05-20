/**
 * Tests for the Figma URL parsing utilities.
 *
 * These utilities are used by cross-plugin.ts to detect Figma links in other
 * issues (e.g., Jira tickets) and fetch design context.
 */

import { describe, expect, it } from "vitest";
import { canParseFigma, extractFigmaRef } from "../parser.ts";

// canParseFigma

describe("canParseFigma", () => {
  it("matches /file/ URLs", () => {
    expect(canParseFigma("https://www.figma.com/file/abc123XYZ/My-App")).toBe(true);
  });

  it("matches /design/ URLs", () => {
    expect(canParseFigma("https://www.figma.com/design/abc123XYZ/My-App")).toBe(true);
  });

  it("matches /proto/ URLs", () => {
    expect(canParseFigma("https://www.figma.com/proto/abc123XYZ/My-App")).toBe(true);
  });

  it("matches URLs with node-id query param", () => {
    expect(canParseFigma("https://www.figma.com/file/abc123XYZ/My-App?node-id=1-23")).toBe(true);
  });

  it("matches URLs without a trailing slug", () => {
    expect(canParseFigma("https://www.figma.com/file/abc123XYZ")).toBe(true);
  });

  it("matches URLs without www prefix", () => {
    expect(canParseFigma("https://figma.com/file/abc123XYZ/My-App")).toBe(true);
  });

  it("rejects plain text", () => {
    expect(canParseFigma("fix the login page")).toBe(false);
  });

  it("rejects unrelated URLs", () => {
    expect(canParseFigma("https://github.com/user/repo")).toBe(false);
    expect(canParseFigma("https://example.com/figma/file/abc123")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(canParseFigma("")).toBe(false);
  });
});

// extractFigmaRef

describe("extractFigmaRef", () => {
  it("extracts fileKey from a bare /file/ URL", () => {
    const ref = extractFigmaRef("https://www.figma.com/file/abc123XYZ/My-App");
    expect(ref).not.toBeNull();
    expect(ref!.fileKey).toBe("abc123XYZ");
    expect(ref!.nodeId).toBeUndefined();
  });

  it("extracts fileKey from a /design/ URL", () => {
    const ref = extractFigmaRef("https://www.figma.com/design/XYZabc123/Dashboard");
    expect(ref!.fileKey).toBe("XYZabc123");
  });

  it("extracts nodeId from the node-id query param", () => {
    const ref = extractFigmaRef("https://www.figma.com/file/abc123XYZ/My-App?node-id=5-10");
    expect(ref!.fileKey).toBe("abc123XYZ");
    expect(ref!.nodeId).toBe("5:10"); // hyphens normalised to colons
  });

  it("normalises node-id with multiple segments", () => {
    const ref = extractFigmaRef("https://www.figma.com/file/abc123XYZ/My-App?node-id=123-456");
    expect(ref!.nodeId).toBe("123:456");
  });

  it("decodes the display name from the URL slug", () => {
    const ref = extractFigmaRef("https://www.figma.com/file/abc123XYZ/My-Cool-App");
    expect(ref!.displayName).toBe("My Cool App");
  });

  it("builds a canonical file-level URL (no node-id)", () => {
    const ref = extractFigmaRef("https://www.figma.com/design/abc123XYZ/My-App");
    expect(ref!.url).toContain("figma.com/file/abc123XYZ");
    expect(ref!.url).not.toContain("node-id");
  });

  it("builds a canonical URL containing node-id when present", () => {
    const ref = extractFigmaRef("https://www.figma.com/file/abc123XYZ/My-App?node-id=5-10");
    expect(ref!.url).toContain("node-id=5:10");
  });

  it("returns null for non-Figma input", () => {
    expect(extractFigmaRef("https://github.com/user/repo")).toBeNull();
    expect(extractFigmaRef("AM-123")).toBeNull();
  });

  it("trims leading/trailing whitespace before parsing", () => {
    const ref = extractFigmaRef("  https://www.figma.com/file/abc123XYZ/App  ");
    expect(ref).not.toBeNull();
    expect(ref!.fileKey).toBe("abc123XYZ");
  });
});
