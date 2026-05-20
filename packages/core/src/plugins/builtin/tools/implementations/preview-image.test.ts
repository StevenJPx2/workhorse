import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ToolExecutionContext } from "#workflow/orchestrator";

import { previewImageToolImpl } from "./preview-image.ts";

describe("previewImageToolImpl", () => {
  let testDir: string;
  let mockContext: ToolExecutionContext;

  beforeAll(() => {
    testDir = join(tmpdir(), `preview-image-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    mockContext = {
      issueId: "TEST-123",
      worktreePath: testDir,
      db: {} as any,
      hooks: {} as any,
      memory: {} as any,
    };

    // Create test images (minimal valid PNG/JPEG headers)
    // Minimal 1x1 red PNG (67 bytes)
    const pngData = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108020000009" +
        "0774d6100000001435349434850525420494d41474520436f707972696768" +
        "74204170706c6520496e632e2c20323031360000000c4944415408d763f8cf" +
        "c0000002000100e5010d570000000049454e44ae426082",
      "hex",
    );
    writeFileSync(join(testDir, "test.png"), pngData);

    // Simple JPEG (using standard JFIF header)
    const jpegData = Buffer.from(
      "ffd8ffe000104a46494600010100000100010000ffdb0043000101010101" +
        "010101010101010101010101010101010101010101010101010101010101" +
        "0101010101010101010101010101010101010101010101ffc0000b080001" +
        "0001011100ffda000801010000003f00d3ffd9",
      "hex",
    );
    writeFileSync(join(testDir, "test.jpg"), jpegData);
    writeFileSync(join(testDir, "test.jpeg"), jpegData);

    // Create a text file for unsupported format test
    writeFileSync(join(testDir, "test.txt"), "not an image");
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("successful image loading", () => {
    it("loads a PNG image and returns base64 data", async () => {
      const result = await previewImageToolImpl({ path: "test.png" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Image loaded: test.png");
      expect(result.output).toContain("image/png");
      expect(result.images).toBeDefined();
      expect(result.images).toHaveLength(1);

      const image = result.images?.[0];
      expect(image?.type).toBe("image");
      expect(image?.mimeType).toBe("image/png");
      expect(image?.data).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
    });

    it("loads a JPEG image (.jpg extension)", async () => {
      const result = await previewImageToolImpl({ path: "test.jpg" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.images).toBeDefined();
      expect(result.images).toHaveLength(1);
      expect(result.images?.[0]?.mimeType).toBe("image/jpeg");
    });

    it("loads a JPEG image (.jpeg extension)", async () => {
      const result = await previewImageToolImpl({ path: "test.jpeg" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.images).toBeDefined();
      expect(result.images?.[0]?.mimeType).toBe("image/jpeg");
    });

    it("resolves relative paths from worktree", async () => {
      const result = await previewImageToolImpl({ path: "./test.png" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.images).toBeDefined();
      expect(result.images).toHaveLength(1);
    });

    it("handles absolute paths", async () => {
      const result = await previewImageToolImpl({ path: join(testDir, "test.png") }, mockContext);

      expect(result.success).toBe(true);
      expect(result.images).toBeDefined();
      expect(result.images).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("returns error for missing path parameter", async () => {
      const result = await previewImageToolImpl({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Path is required");
      expect(result.images).toBeUndefined();
    });

    it("returns error for non-existent file", async () => {
      const result = await previewImageToolImpl({ path: "nonexistent.png" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("returns error for unsupported file format", async () => {
      const result = await previewImageToolImpl({ path: "test.txt" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported image format");
      expect(result.error).toContain(".txt");
      expect(result.error).toContain("Supported:");
    });

    it("returns error for file without extension", async () => {
      writeFileSync(join(testDir, "noext"), "data");
      const result = await previewImageToolImpl({ path: "noext" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported image format");
    });
  });

  describe("file size limits", () => {
    it("returns error for images exceeding 10MB", async () => {
      // Create a large file (> 10MB)
      const largePath = join(testDir, "large.png");
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      writeFileSync(largePath, largeBuffer);

      const result = await previewImageToolImpl({ path: "large.png" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Image too large");
      expect(result.error).toContain("max 10MB");
    });
  });
});
