/**
 * Tests for jira_get_attachments tool.
 */

import type { AttachmentService } from "workhorse-core";
import { describe, expect, it, vi } from "vitest";
import type { AtlassianClient } from "../client.ts";
import { createGetAttachmentsTool } from "../tools/get-attachments.ts";

/** Create mock database with Jira issue */
// oxlint-disable-next-line workhorse/no-single-reference-function -- test utility
function createMockDb(externalId: string, source: string = "jira") {
  return {
    issues: {
      getByExternalId: vi.fn().mockImplementation((extId: string, src: string) => {
        if (extId === externalId && src === source) {
          return { id: "uuid-123", externalId, source };
        }
        return undefined;
      }),
    },
  };
}

/** Create a mock database that returns repository info */
function createMockDbWithRepo(externalId: string, repository: string) {
  return {
    issues: {
      getByExternalId: vi.fn().mockImplementation((extId: string, src: string) => {
        if (extId === externalId && src === "jira") {
          return { id: "uuid-123", externalId, source: "jira", repository };
        }
        return undefined;
      }),
    },
  };
}

/** Create mock attachment service */
function createMockAttachmentService() {
  return {
    exists: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockImplementation(async (_repo, _issue, _content, meta) => ({
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: meta.size,
      localPath: `/attachments/${meta.sourceId}_${meta.filename}`,
    })),
    getIssueDir: vi.fn().mockReturnValue("/attachments"),
  } as unknown as AttachmentService;
}

describe("jira_get_attachments tool", () => {
  it("downloads and returns attachments successfully", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          attachment: [
            {
              id: "att-1",
              filename: "screenshot.png",
              mimeType: "image/png",
              size: 12345,
              content: "https://jira.example.com/attachment/att-1",
            },
          ],
          comment: { comments: [] },
        },
      }),
      downloadAttachment: vi.fn().mockResolvedValue(Buffer.from("image-data")),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    expect(mockClient.fetchIssueWithAttachments).toHaveBeenCalledWith("AM-123");
    expect(mockClient.downloadAttachment).toHaveBeenCalledWith(
      "https://jira.example.com/attachment/att-1",
    );

    const output = JSON.parse(result.output!);
    expect(output.total).toBe(1);
    expect(output.attachments[0].filename).toBe("screenshot.png");
    expect(output.attachments[0].localPath).toContain("screenshot.png");
  });

  it("filters to images only when imagesOnly is true", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          attachment: [
            { id: "att-1", filename: "image.png", mimeType: "image/png", size: 100, content: "u1" },
            {
              id: "att-2",
              filename: "doc.pdf",
              mimeType: "application/pdf",
              size: 200,
              content: "u2",
            },
            {
              id: "att-3",
              filename: "photo.jpg",
              mimeType: "image/jpeg",
              size: 300,
              content: "u3",
            },
          ],
          comment: { comments: [] },
        },
      }),
      downloadAttachment: vi.fn().mockResolvedValue(Buffer.from("data")),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      { imagesOnly: true },
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    // Should only have 2 images, not the PDF
    expect(output.total).toBe(2);
    expect(output.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      "image.png",
      "photo.jpg",
    ]);
  });

  it("returns no attachments message when empty", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          attachment: [],
          comment: { comments: [] },
        },
      }),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.total).toBe(0);
    expect(output.message).toBe("No attachments found");
  });

  it("detects embedded media in comments", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          attachment: [
            {
              id: "media-123",
              filename: "img.png",
              mimeType: "image/png",
              size: 100,
              content: "u1",
            },
          ],
          comment: {
            comments: [
              {
                id: "comment-1",
                author: { displayName: "Alice" },
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "mediaSingle",
                      content: [{ type: "media", attrs: { id: "media-123", type: "file" } }],
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      downloadAttachment: vi.fn().mockResolvedValue(Buffer.from("data")),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.commentMedia).toHaveLength(1);
    expect(output.commentMedia[0].commentId).toBe("comment-1");
    expect(output.commentMedia[0].author).toBe("Alice");
    expect(output.commentMedia[0].mediaCount).toBe(1);
    expect(output.commentMedia[0].mediaIds).toContain("media-123");
  });

  it("reports unmatched media IDs in comments", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          attachment: [],
          comment: {
            comments: [
              {
                id: "comment-1",
                author: { displayName: "Bob" },
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "mediaSingle",
                      content: [
                        { type: "media", attrs: { id: "external-media-456", type: "file" } },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output!);
    expect(output.unmatchedMediaIds).toContain("external-media-456");
    expect(output.commentMediaNote).toContain("require viewing the Jira ticket");
  });

  it("returns error for non-Jira issues", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn(),
    } as unknown as AtlassianClient;

    const mockDb = createMockDb("owner/repo#123", "github");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "owner/repo#123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(mockClient.fetchIssueWithAttachments).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("only works for Jira-sourced issues");
  });

  it("returns error on API failure", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockRejectedValue(new Error("API timeout")),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = createMockAttachmentService();

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("API timeout");
  });

  it("skips already downloaded attachments", async () => {
    const mockClient = {
      fetchIssueWithAttachments: vi.fn().mockResolvedValue({
        key: "AM-123",
        fields: {
          attachment: [
            { id: "att-1", filename: "img.png", mimeType: "image/png", size: 100, content: "u1" },
          ],
          comment: { comments: [] },
        },
      }),
      downloadAttachment: vi.fn(),
    } as unknown as AtlassianClient;

    const mockDb = createMockDbWithRepo("AM-123", "owner/repo");
    const mockAttachmentService = {
      exists: vi.fn().mockResolvedValue("/existing/path/att-1_img.png"),
      store: vi.fn(),
      getIssueDir: vi.fn().mockReturnValue("/attachments"),
    } as unknown as AttachmentService;

    const tool = createGetAttachmentsTool(mockClient, mockAttachmentService);

    const result = await tool.execute(
      {},
      {
        issueId: "AM-123",
        worktreePath: "/tmp",
        db: mockDb as any,
        hooks: {} as any,
        memory: {} as any,
      },
    );

    expect(result.success).toBe(true);
    // Should not download since it already exists
    expect(mockClient.downloadAttachment).not.toHaveBeenCalled();
    expect(mockAttachmentService.store).not.toHaveBeenCalled();
  });
});
