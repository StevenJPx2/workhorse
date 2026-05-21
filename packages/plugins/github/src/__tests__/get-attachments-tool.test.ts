/**
 * Tests for github_get_attachments tool
 */
import { describe, expect, it, vi } from "vitest";
import type { AttachmentService } from "workhorse-core";

import type { GitHubClient } from "../client.ts";
import { createGetAttachmentsTool } from "../tools/get-attachments.ts";

describe("github_get_attachments", () => {
  const createMockClient = () => ({
    fetchIssue: vi.fn(),
    getPRComments: vi.fn(),
  });

  const createMockService = () => ({
    exists: vi.fn().mockResolvedValue(null),
    store: vi.fn(
      async (
        _repo: string,
        _issue: string,
        _content: Buffer,
        metadata: unknown,
      ) => {
        const m = metadata as {
          filename: string;
          mimeType: string;
          size: number;
          originalUrl: string;
        };
        return {
          filename: m.filename,
          mimeType: m.mimeType,
          size: m.size,
          localPath: `/attachments/${m.filename}`,
          originalUrl: m.originalUrl,
        };
      },
    ),
    getIssueDir: vi.fn(() => "/attachments"),
    list: vi.fn(),
    delete: vi.fn(),
  });

  it("extracts and downloads images from issue body", async () => {
    const mockClient = createMockClient();
    const mockService = createMockService();

    mockClient.fetchIssue.mockResolvedValue({
      body: "Screenshot: ![img](https://user-images.githubusercontent.com/1/screenshot.png)",
    });
    mockClient.getPRComments.mockResolvedValue([]);

    const mockBuffer = Buffer.from("image data");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
    }) as unknown as typeof fetch;

    const tool = createGetAttachmentsTool(
      mockClient as unknown as GitHubClient,
      mockService as unknown as AttachmentService,
    );

    try {
      const result = await tool.execute(
        { owner: "octocat", repo: "hello-world", number: 1 },
        {
          issueId: "issue-1",
        } as never,
      );

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output!);
      expect(output.total).toBe(1);
      expect(output.downloaded).toBe(1);
      expect(output.attachments).toHaveLength(1);
      expect(output.attachments[0].filename).toBe("screenshot.png");
      expect(output.directory).toBe("/attachments");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extracts images from comments", async () => {
    const mockClient = createMockClient();
    const mockService = createMockService();

    mockClient.fetchIssue.mockResolvedValue({ body: null });
    mockClient.getPRComments.mockResolvedValue([
      {
        id: 100,
        body: "Here: ![fix](https://user-images.githubusercontent.com/1/fix.png)",
        user: { login: "user1" },
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);

    const mockBuffer = Buffer.from("image data");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
    }) as unknown as typeof fetch;

    const tool = createGetAttachmentsTool(
      mockClient as unknown as GitHubClient,
      mockService as unknown as AttachmentService,
    );

    try {
      const result = await tool.execute(
        { owner: "octocat", repo: "hello-world", number: 1 },
        {
          issueId: "issue-1",
        } as never,
      );

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output!);
      expect(output.total).toBe(1);
      expect(output.downloaded).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns cached attachments without re-downloading", async () => {
    const mockClient = createMockClient();
    const mockService = createMockService();

    mockClient.fetchIssue.mockResolvedValue({
      body: "![img](https://user-images.githubusercontent.com/1/cached.png)",
    });
    mockClient.getPRComments.mockResolvedValue([]);

    // Mock exists to return a cached path
    mockService.exists.mockResolvedValue("/attachments/cached.png");

    const tool = createGetAttachmentsTool(
      mockClient as unknown as GitHubClient,
      mockService as unknown as AttachmentService,
    );

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 1 },
      {
        issueId: "issue-1",
      } as never,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.total).toBe(1);
    expect(output.downloaded).toBe(0);
    expect(output.cached).toBe(1);
    expect(output.cachedPaths).toEqual(["/attachments/cached.png"]);
    expect(mockService.store).not.toHaveBeenCalled();
  });

  it("returns empty result when no images found", async () => {
    const mockClient = createMockClient();
    const mockService = createMockService();

    mockClient.fetchIssue.mockResolvedValue({
      body: "No images here, just text.",
    });
    mockClient.getPRComments.mockResolvedValue([]);

    const tool = createGetAttachmentsTool(
      mockClient as unknown as GitHubClient,
      mockService as unknown as AttachmentService,
    );

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 1 },
      {
        issueId: "issue-1",
      } as never,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.message).toBe("No image attachments found");
    expect(output.total).toBe(0);
    expect(output.attachments).toEqual([]);
  });

  it("reports failed downloads", async () => {
    const mockClient = createMockClient();
    const mockService = createMockService();

    mockClient.fetchIssue.mockResolvedValue({
      body: "![private](https://private.example.com/secret.png)",
    });
    mockClient.getPRComments.mockResolvedValue([]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as unknown as typeof fetch;

    const tool = createGetAttachmentsTool(
      mockClient as unknown as GitHubClient,
      mockService as unknown as AttachmentService,
    );

    try {
      const result = await tool.execute(
        { owner: "octocat", repo: "hello-world", number: 1 },
        {
          issueId: "issue-1",
        } as never,
      );

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output!);
      expect(output.total).toBe(0);
      expect(output.downloaded).toBe(0);
      expect(output.failed).toHaveLength(1);
      expect(output.failed[0].error).toContain("403");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles API errors gracefully", async () => {
    const mockClient = createMockClient();
    const mockService = createMockService();

    mockClient.fetchIssue.mockRejectedValue(
      new Error("API rate limit exceeded"),
    );

    const tool = createGetAttachmentsTool(
      mockClient as unknown as GitHubClient,
      mockService as unknown as AttachmentService,
    );

    const result = await tool.execute(
      { owner: "octocat", repo: "hello-world", number: 1 },
      {
        issueId: "issue-1",
      } as never,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("API rate limit exceeded");
  });
});
