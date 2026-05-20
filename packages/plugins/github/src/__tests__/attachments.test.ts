/**
 * Tests for GitHub attachment utilities.
 *
 * @module workhorse-plugin-github/__tests__/attachments
 */

import { describe, expect, it, vi } from "vitest";
import type { AttachmentService } from "workhorse-core";

import { downloadAttachments, downloadImage } from "../attachment-download.ts";
import {
  countImagesInMarkdown,
  extractAllAttachments,
  extractImagesFromMarkdown,
  filterImageAttachments,
} from "../attachments.ts";
import type { GitHubComment } from "../types.ts";

/** Create a minimal GitHubComment for testing */
function makeComment(id: number, body: string): GitHubComment {
  return {
    id,
    body,
    user: { login: "testuser" },
    created_at: "2024-01-01T00:00:00Z",
  };
}

describe("extractImagesFromMarkdown", () => {
  it("extracts markdown-style images", () => {
    const markdown =
      "Check this: ![screenshot](https://user-images.githubusercontent.com/123/img.png)";
    const result = extractImagesFromMarkdown(markdown, "body");

    expect(result).toHaveLength(1);
    expect(result[0]!).toMatchObject({
      url: "https://user-images.githubusercontent.com/123/img.png",
      alt: "screenshot",
      source: "body",
      mimeType: "image/png",
      filename: "img.png",
    });
    expect(result[0]!.id).toHaveLength(12); // MD5 hash truncated
  });

  it("extracts HTML img tags", () => {
    const markdown = 'See <img src="https://github.githubassets.com/images/logo.jpg" alt="logo">';
    const result = extractImagesFromMarkdown(markdown, "comment-1");

    expect(result).toHaveLength(1);
    expect(result[0]!).toMatchObject({
      url: "https://github.githubassets.com/images/logo.jpg",
      source: "comment-1",
      mimeType: "image/jpeg",
      filename: "logo.jpg",
    });
  });

  it("handles multiple images", () => {
    const markdown = `
      ![first](https://user-images.githubusercontent.com/1/a.png)
      ![second](https://user-images.githubusercontent.com/2/b.gif)
      <img src="https://raw.githubusercontent.com/org/repo/main/c.webp">
    `;
    const result = extractImagesFromMarkdown(markdown, "body");

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.filename)).toEqual(["a.png", "b.gif", "c.webp"]);
    expect(result.map((r) => r.mimeType)).toEqual(["image/png", "image/gif", "image/webp"]);
  });

  it("deduplicates same URL appearing multiple times", () => {
    const markdown = `
      ![img](https://user-images.githubusercontent.com/1/same.png)
      ![img again](https://user-images.githubusercontent.com/1/same.png)
    `;
    const result = extractImagesFromMarkdown(markdown, "body");

    expect(result).toHaveLength(1);
  });

  it("filters non-image URLs", () => {
    const markdown = `
      ![valid](https://user-images.githubusercontent.com/1/img.png)
      ![invalid](https://example.com/page)
      ![also invalid](https://random.site/file.txt)
    `;
    const result = extractImagesFromMarkdown(markdown, "body");

    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe("img.png");
  });

  it("accepts common image extensions from non-GitHub domains", () => {
    const markdown = `
      ![external](https://cdn.example.com/photo.jpg)
      ![another](https://images.site.org/diagram.svg)
    `;
    const result = extractImagesFromMarkdown(markdown, "body");

    expect(result).toHaveLength(2);
    expect(result[0]!.mimeType).toBe("image/jpeg");
    expect(result[1]!.mimeType).toBe("image/svg+xml");
  });

  it("handles null/empty input", () => {
    expect(extractImagesFromMarkdown(null, "body")).toEqual([]);
    expect(extractImagesFromMarkdown("", "body")).toEqual([]);
  });

  it("generates stable IDs from URL hashes", () => {
    const markdown = "![img](https://user-images.githubusercontent.com/123/test.png)";
    const result1 = extractImagesFromMarkdown(markdown, "body");
    const result2 = extractImagesFromMarkdown(markdown, "body");

    expect(result1[0]!.id).toBe(result2[0]!.id);
  });

  it("handles GitHub UUID-style filenames", () => {
    const markdown =
      "![img](https://user-images.githubusercontent.com/123/abc12345-def6-7890-abcd-ef1234567890.png)";
    const result = extractImagesFromMarkdown(markdown, "body");

    // Should generate a readable filename instead of UUID
    expect(result[0]!.filename).toMatch(/^github-image-[a-f0-9]+\.png$/);
  });
});

describe("extractAllAttachments", () => {
  it("extracts from body and comments", () => {
    const body = "Body image: ![body](https://user-images.githubusercontent.com/1/body.png)";
    const comments: GitHubComment[] = [
      makeComment(100, "Comment image: ![c1](https://user-images.githubusercontent.com/2/c1.png)"),
      makeComment(200, "Another: ![c2](https://user-images.githubusercontent.com/3/c2.jpg)"),
    ];

    const result = extractAllAttachments(body, comments);

    expect(result).toHaveLength(3);
    expect(result[0]!.source).toBe("body");
    expect(result[1]!.source).toBe("comment-100");
    expect(result[2]!.source).toBe("comment-200");
  });

  it("handles empty body", () => {
    const comments: GitHubComment[] = [
      makeComment(1, "![img](https://user-images.githubusercontent.com/1/img.png)"),
    ];

    const result = extractAllAttachments(null, comments);

    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("comment-1");
  });

  it("handles no comments", () => {
    const body = "![img](https://user-images.githubusercontent.com/1/img.png)";

    const result = extractAllAttachments(body, []);

    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("body");
  });
});

describe("filterImageAttachments", () => {
  it("filters to image mime types only", () => {
    const attachments = [
      { id: "1", url: "a.png", source: "body", mimeType: "image/png", filename: "a.png" },
      { id: "2", url: "b.svg", source: "body", mimeType: "image/svg+xml", filename: "b.svg" },
      { id: "3", url: "c.txt", source: "body", mimeType: "text/plain", filename: "c.txt" },
    ];

    const result = filterImageAttachments(attachments);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.filename)).toEqual(["a.png", "b.svg"]);
  });
});

describe("countImagesInMarkdown", () => {
  it("counts images in markdown text", () => {
    const markdown = `
      ![first](https://user-images.githubusercontent.com/1/a.png)
      ![second](https://user-images.githubusercontent.com/2/b.gif)
      <img src="https://raw.githubusercontent.com/org/repo/main/c.webp">
    `;
    expect(countImagesInMarkdown(markdown)).toBe(3);
  });

  it("returns 0 for null/empty input", () => {
    expect(countImagesInMarkdown(null)).toBe(0);
    expect(countImagesInMarkdown("")).toBe(0);
  });

  it("returns 0 for text without images", () => {
    expect(countImagesInMarkdown("Just some text without images")).toBe(0);
  });
});

describe("downloadImage", () => {
  it("downloads image from URL", async () => {
    const mockBuffer = Buffer.from("fake image data");
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const result = await downloadImage("https://example.com/image.png");

      expect(result).toBeInstanceOf(Buffer);
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/image.png", {
        headers: { "User-Agent": "Workhorse-GitHub-Plugin/1.0" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as unknown as typeof fetch;

    try {
      await expect(downloadImage("https://example.com/missing.png")).rejects.toThrow(
        "Failed to download image: 404 Not Found",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("downloadAttachments", () => {
  const createMockService = (existingPaths: Record<string, string> = {}) => ({
    exists: vi.fn(async (_repo: string, _issue: string, id: string) => existingPaths[id] || null),
    store: vi.fn(async (_repo: string, _issue: string, _content: Buffer, metadata: any) => ({
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      size: metadata.size,
      localPath: `/attachments/${metadata.filename}`,
      originalUrl: metadata.originalUrl,
    })),
    getIssueDir: vi.fn(() => "/attachments"),
    list: vi.fn(),
    delete: vi.fn(),
  });

  it("downloads new attachments", async () => {
    const service = createMockService();
    const mockData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockData.buffer.slice(0, mockData.length)),
    }) as unknown as typeof fetch;

    const attachments = [
      {
        id: "abc123",
        url: "https://user-images.githubusercontent.com/1/new.png",
        source: "body",
        mimeType: "image/png",
        filename: "new.png",
      },
    ];

    try {
      const result = await downloadAttachments(
        service as unknown as AttachmentService,
        "owner/repo",
        "issue-1",
        attachments,
      );

      expect(result.downloaded).toHaveLength(1);
      expect(result.cached).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(service.store).toHaveBeenCalledWith("owner/repo", "issue-1", expect.any(Buffer), {
        source: "github",
        sourceId: "abc123",
        filename: "new.png",
        mimeType: "image/png",
        size: mockData.length,
        originalUrl: "https://user-images.githubusercontent.com/1/new.png",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns cached paths for existing attachments", async () => {
    const service = createMockService({ abc123: "/attachments/cached.png" });

    const attachments = [
      {
        id: "abc123",
        url: "https://user-images.githubusercontent.com/1/cached.png",
        source: "body",
        mimeType: "image/png",
        filename: "cached.png",
      },
    ];

    const result = await downloadAttachments(
      service as unknown as AttachmentService,
      "owner/repo",
      "issue-1",
      attachments,
    );

    expect(result.downloaded).toHaveLength(0);
    expect(result.cached).toEqual(["/attachments/cached.png"]);
    expect(result.failed).toHaveLength(0);
    expect(service.store).not.toHaveBeenCalled();
  });

  it("reports failed downloads", async () => {
    const service = createMockService();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as unknown as typeof fetch;

    const attachments = [
      {
        id: "abc123",
        url: "https://private.github.com/secret.png",
        source: "body",
        mimeType: "image/png",
        filename: "secret.png",
      },
    ];

    try {
      const result = await downloadAttachments(
        service as unknown as AttachmentService,
        "owner/repo",
        "issue-1",
        attachments,
      );

      expect(result.downloaded).toHaveLength(0);
      expect(result.cached).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toMatchObject({
        url: "https://private.github.com/secret.png",
        error: expect.stringContaining("403"),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
