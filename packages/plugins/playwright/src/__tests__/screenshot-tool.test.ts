/**
 * Tests for playwright_screenshot tool with AttachmentService
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock session-operations module
const mockScreenshot = vi.fn();

vi.mock("../session-operations.ts", () => ({
  screenshot: mockScreenshot,
}));

// Import after mocking
const { createScreenshotTool } = await import("../tools/screenshot.ts");

// Test directory for temp files
const testDir = join(tmpdir(), "wh-screenshot-test");

describe("playwright_screenshot tool", () => {
  // Mock session manager
  const mockSessionManager = {
    getSessionState: vi.fn(),
    getDefaultTimeout: vi.fn(() => 30000),
    getHooks: vi.fn(() => ({ emit: vi.fn() })),
  };

  // Mock context
  const createMockContext = (issueId = "TEST-123") => ({
    issueId,
    worktreePath: testDir,
    db: {
      issues: {
        getById: vi.fn().mockResolvedValue({ repository: "org/repo" }),
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("without AttachmentService (legacy behavior)", () => {
    it("saves screenshot to worktree path", async () => {
      mockScreenshot.mockResolvedValue({
        success: true,
        path: join(testDir, "screenshot.png"),
      });

      const tool = createScreenshotTool(mockSessionManager as never);
      const ctx = createMockContext();

      const result = await tool.execute(
        { filename: "screenshot.png" },
        ctx as never,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Screenshot saved to: screenshot.png");
      expect(mockScreenshot).toHaveBeenCalledWith(
        mockSessionManager,
        "TEST-123",
        join(testDir, "screenshot.png"),
        {
          fullPage: undefined,
          format: undefined,
          quality: undefined,
        },
      );
    });

    it("includes full page indicator in output", async () => {
      mockScreenshot.mockResolvedValue({
        success: true,
        path: join(testDir, "full.png"),
      });

      const tool = createScreenshotTool(mockSessionManager as never);
      const ctx = createMockContext();

      const result = await tool.execute(
        { filename: "full.png", fullPage: true },
        ctx as never,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("(full page)");
    });

    it("returns error when screenshot fails", async () => {
      mockScreenshot.mockResolvedValue({
        success: false,
        error: "No page loaded",
      });

      const tool = createScreenshotTool(mockSessionManager as never);
      const ctx = createMockContext();

      const result = await tool.execute({}, ctx as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No page loaded");
    });

    it("generates default filename with timestamp", async () => {
      mockScreenshot.mockResolvedValue({ success: true, path: "" });

      const tool = createScreenshotTool(mockSessionManager as never);
      const ctx = createMockContext();

      await tool.execute({}, ctx as never);

      const call = mockScreenshot.mock.calls[0] as [
        unknown,
        unknown,
        string,
        unknown,
      ];
      const filepath = call[2];
      expect(filepath).toMatch(/screenshot-\d+\.png$/);
    });

    it("uses jpeg extension when format is jpeg", async () => {
      mockScreenshot.mockResolvedValue({ success: true, path: "" });

      const tool = createScreenshotTool(mockSessionManager as never);
      const ctx = createMockContext();

      await tool.execute({ format: "jpeg" }, ctx as never);

      const call = mockScreenshot.mock.calls[0] as [
        unknown,
        unknown,
        string,
        unknown,
      ];
      const filepath = call[2];
      expect(filepath).toMatch(/\.jpeg$/);
    });
  });

  describe("with AttachmentService", () => {
    const mockAttachmentServiceFns = {
      store: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };
    const mockAttachmentService =
      mockAttachmentServiceFns as unknown as import("workhorse-core").AttachmentService;

    beforeEach(() => {
      mockAttachmentServiceFns.store.mockReset();
      mockAttachmentServiceFns.store.mockResolvedValue({
        localPath: "/attachments/org/repo/TEST-123/screenshot_test.png",
        size: 1024,
        mimeType: "image/png",
      });
    });

    it("stores screenshot via attachment service", async () => {
      // Mock screenshot to create a temp file
      mockScreenshot.mockImplementation(async (_mgr, _issueId, tempPath) => {
        writeFileSync(tempPath, Buffer.from("fake png data"));
        return { success: true, path: tempPath };
      });

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();

      const result = await tool.execute({ filename: "test.png" }, ctx as never);

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output as string);
      expect(output.message).toContain("Screenshot saved");
      expect(output.localPath).toBe(
        "/attachments/org/repo/TEST-123/screenshot_test.png",
      );
      expect(output.filename).toBe("test.png");

      // Verify attachment service was called
      expect(mockAttachmentService.store).toHaveBeenCalledWith(
        "org/repo",
        "TEST-123",
        expect.any(Buffer),
        expect.objectContaining({
          source: "playwright",
          filename: "test.png",
          mimeType: "image/png",
        }),
      );
    });

    it("uses correct MIME type for jpeg format", async () => {
      mockScreenshot.mockImplementation(async (_mgr, _issueId, tempPath) => {
        writeFileSync(tempPath, Buffer.from("fake jpeg data"));
        return { success: true, path: tempPath };
      });
      mockAttachmentServiceFns.store.mockResolvedValue({
        localPath: "/attachments/org/repo/TEST-123/screenshot_photo.jpeg",
        size: 2048,
        mimeType: "image/jpeg",
      });

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();

      await tool.execute(
        { filename: "photo.jpeg", format: "jpeg" },
        ctx as never,
      );

      expect(mockAttachmentService.store).toHaveBeenCalledWith(
        "org/repo",
        "TEST-123",
        expect.any(Buffer),
        expect.objectContaining({
          mimeType: "image/jpeg",
        }),
      );
    });

    it("includes full page indicator in JSON output", async () => {
      mockScreenshot.mockImplementation(async (_mgr, _issueId, tempPath) => {
        writeFileSync(tempPath, Buffer.from("fake png data"));
        return { success: true, path: tempPath };
      });

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();

      const result = await tool.execute({ fullPage: true }, ctx as never);

      const output = JSON.parse(result.output as string);
      expect(output.message).toContain("(full page)");
    });

    it("falls back to unknown repository when issue not found", async () => {
      mockScreenshot.mockImplementation(async (_mgr, _issueId, tempPath) => {
        writeFileSync(tempPath, Buffer.from("fake png data"));
        return { success: true, path: tempPath };
      });

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();
      ctx.db.issues.getById = vi.fn().mockResolvedValue(null);

      await tool.execute({}, ctx as never);

      expect(mockAttachmentService.store).toHaveBeenCalledWith(
        "unknown",
        "TEST-123",
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it("returns error when screenshot operation fails", async () => {
      mockScreenshot.mockResolvedValue({
        success: false,
        error: "Browser closed",
      });

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();

      const result = await tool.execute({}, ctx as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Browser closed");
      expect(mockAttachmentService.store).not.toHaveBeenCalled();
    });

    it("returns error when attachment service store fails", async () => {
      mockScreenshot.mockImplementation(async (_mgr, _issueId, tempPath) => {
        writeFileSync(tempPath, Buffer.from("fake png data"));
        return { success: true, path: tempPath };
      });
      mockAttachmentServiceFns.store.mockRejectedValue(new Error("Disk full"));

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();

      const result = await tool.execute({}, ctx as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Disk full");
    });

    it("cleans up temp file after successful store", async () => {
      let capturedTempPath = "";
      mockScreenshot.mockImplementation(async (_mgr, _issueId, tempPath) => {
        capturedTempPath = tempPath;
        writeFileSync(tempPath, Buffer.from("fake png data"));
        return { success: true, path: tempPath };
      });

      const tool = createScreenshotTool(
        mockSessionManager as never,
        mockAttachmentService,
      );
      const ctx = createMockContext();

      await tool.execute({}, ctx as never);

      // Temp file should be cleaned up
      expect(existsSync(capturedTempPath)).toBe(false);
    });
  });

  describe("tool metadata", () => {
    it("has correct name and description", () => {
      const tool = createScreenshotTool(mockSessionManager as never);

      expect(tool.name).toBe("playwright_screenshot");
      expect(tool.description).toContain("screenshot");
    });

    it("has correct schema properties", () => {
      const tool = createScreenshotTool(mockSessionManager as never);

      expect(tool.schema.properties).toHaveProperty("filename");
      expect(tool.schema.properties).toHaveProperty("fullPage");
      expect(tool.schema.properties).toHaveProperty("format");
      expect(tool.schema.properties).toHaveProperty("quality");
      expect(tool.schema.required).toEqual([]);
    });
  });
});
