/**
 * Tests for web plugin tools.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolExecutionContext } from "workhorse-core";
import { createWebReadTool, createWebSearchTool, createScreenshotTool } from "../tools";
import * as client from "../client.ts";

// Mock execution context
const mockCtx = {} as ToolExecutionContext;

// Mock the execJina function
vi.mock("../client.ts", async () => {
  const actual = await vi.importActual("../client.ts");
  return {
    ...actual,
    execJina: vi.fn(),
  };
});

describe("web_read tool", () => {
  const tool = createWebReadTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("web_read");
    expect(tool.description).toContain("markdown");
    expect(tool.schema.required).toContain("url");
  });

  it("calls jina read with URL", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: true,
      stdout: "# Page Title\n\nContent here",
      stderr: "",
      exitCode: 0,
    });

    const result = await tool.execute({ url: "https://example.com" }, mockCtx);

    expect(client.execJina).toHaveBeenCalledWith(
      ["read", "https://example.com"],
      expect.any(Object),
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("Page Title");
  });

  it("includes flags when options provided", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: true,
      stdout: "content",
      stderr: "",
      exitCode: 0,
    });

    await tool.execute(
      {
        url: "https://example.com",
        links: true,
        images: true,
        json: true,
      },
      mockCtx,
    );

    expect(client.execJina).toHaveBeenCalledWith(
      ["read", "https://example.com", "--links", "--images", "--json"],
      expect.any(Object),
    );
  });

  it("returns error on failure", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: false,
      stdout: "",
      stderr: "Connection refused",
      exitCode: 1,
    });

    const result = await tool.execute({ url: "https://example.com" }, mockCtx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
  });
});

describe("web_search tool", () => {
  const tool = createWebSearchTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("web_search");
    expect(tool.description).toContain("Search");
    expect(tool.schema.required).toContain("query");
  });

  it("calls jina search with query", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: true,
      stdout: "## Result 1\nContent...",
      stderr: "",
      exitCode: 0,
    });

    const result = await tool.execute({ query: "transformer models" }, mockCtx);

    expect(client.execJina).toHaveBeenCalledWith(
      ["search", "transformer models"],
      expect.any(Object),
    );
    expect(result.success).toBe(true);
  });

  it("includes arxiv flag", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: true,
      stdout: "results",
      stderr: "",
      exitCode: 0,
    });

    await tool.execute({ query: "attention", arxiv: true, count: 10 }, mockCtx);

    expect(client.execJina).toHaveBeenCalledWith(
      ["search", "attention", "-n", "10", "--arxiv"],
      expect.any(Object),
    );
  });
});

describe("web_screenshot tool", () => {
  const tool = createScreenshotTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("web_screenshot");
    expect(tool.description).toContain("screenshot");
    expect(tool.schema.required).toContain("url");
  });

  it("calls jina screenshot", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: true,
      stdout: "https://screenshot-url.com/image.png",
      stderr: "",
      exitCode: 0,
    });

    const result = await tool.execute({ url: "https://example.com" }, mockCtx);

    expect(client.execJina).toHaveBeenCalledWith(
      ["screenshot", "https://example.com"],
      expect.any(Object),
    );
    expect(result.success).toBe(true);
  });

  it("includes output and fullPage flags", async () => {
    vi.mocked(client.execJina).mockResolvedValue({
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await tool.execute(
      {
        url: "https://example.com",
        output: "page.png",
        fullPage: true,
      },
      mockCtx,
    );

    expect(client.execJina).toHaveBeenCalledWith(
      ["screenshot", "https://example.com", "-o", "page.png", "--full-page"],
      expect.any(Object),
    );
    expect(result.output).toContain("page.png");
  });
});
