import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AttachmentService } from "../service.ts";

describe("AttachmentService", () => {
  let service: AttachmentService;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `workhorse-test-attachments-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    service = new AttachmentService(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("getIssueDir", () => {
    it("returns path with sanitized repo identifier", () => {
      const dir = service.getIssueDir("owner/repo", "issue-123");
      expect(dir).toBe(join(testDir, "owner-repo", "issue-123"));
    });

    it("handles special characters in repo name", () => {
      const dir = service.getIssueDir("my@org/my:repo", "AM-456");
      expect(dir).toBe(join(testDir, "my_org-my_repo", "AM-456"));
    });
  });

  describe("store", () => {
    it("stores attachment and returns metadata", async () => {
      const content = Buffer.from("test image data");
      const result = await service.store("owner/repo", "issue-1", content, {
        source: "jira",
        sourceId: "att-123",
        filename: "screenshot.png",
        mimeType: "image/png",
        size: content.length,
        originalUrl: "https://jira.example.com/attachment/123",
      });

      expect(result.sourceId).toBe("att-123");
      expect(result.source).toBe("jira");
      expect(result.filename).toBe("screenshot.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.localPath).toContain("att-123_screenshot.png");
      expect(existsSync(result.localPath)).toBe(true);
    });

    it("creates nested directories", async () => {
      const content = Buffer.from("data");
      const result = await service.store(
        "deep/nested/repo",
        "issue-99",
        content,
        {
          source: "jira",
          sourceId: "att-1",
          filename: "file.txt",
          mimeType: "text/plain",
          size: content.length,
        },
      );

      expect(existsSync(result.localPath)).toBe(true);
    });
  });

  describe("exists", () => {
    it("returns path when attachment exists", async () => {
      const content = Buffer.from("data");
      await service.store("repo", "issue", content, {
        source: "jira",
        sourceId: "existing-123",
        filename: "doc.pdf",
        mimeType: "application/pdf",
        size: content.length,
      });

      const path = await service.exists("repo", "issue", "existing-123");
      expect(path).toBeTruthy();
      expect(path).toContain("existing-123");
    });

    it("returns null when attachment does not exist", async () => {
      const path = await service.exists("repo", "issue", "nonexistent");
      expect(path).toBeNull();
    });
  });

  describe("listForIssue", () => {
    it("lists all attachments for an issue", async () => {
      await service.store("repo", "issue", Buffer.from("a"), {
        source: "jira",
        sourceId: "att-1",
        filename: "a.png",
        mimeType: "image/png",
        size: 1,
      });
      await service.store("repo", "issue", Buffer.from("b"), {
        source: "jira",
        sourceId: "att-2",
        filename: "b.jpg",
        mimeType: "image/jpeg",
        size: 1,
      });

      const list = await service.listForIssue("repo", "issue");
      expect(list).toHaveLength(2);
      expect(list.map((a) => a.sourceId)).toContain("att-1");
      expect(list.map((a) => a.sourceId)).toContain("att-2");
    });

    it("returns empty array for nonexistent issue", async () => {
      const list = await service.listForIssue("repo", "no-such-issue");
      expect(list).toEqual([]);
    });
  });

  describe("delete", () => {
    it("deletes attachment file", async () => {
      const result = await service.store("repo", "issue", Buffer.from("x"), {
        source: "jira",
        sourceId: "to-delete",
        filename: "temp.txt",
        mimeType: "text/plain",
        size: 1,
      });

      expect(existsSync(result.localPath)).toBe(true);
      await service.delete(result.localPath);
      expect(existsSync(result.localPath)).toBe(false);
    });

    it("does not throw for nonexistent file", async () => {
      await expect(
        service.delete("/nonexistent/path.txt"),
      ).resolves.toBeUndefined();
    });
  });

  describe("deleteForIssue", () => {
    it("deletes all attachments and returns count", async () => {
      await service.store("repo", "issue", Buffer.from("1"), {
        source: "jira",
        sourceId: "a1",
        filename: "1.txt",
        mimeType: "text/plain",
        size: 1,
      });
      await service.store("repo", "issue", Buffer.from("2"), {
        source: "jira",
        sourceId: "a2",
        filename: "2.txt",
        mimeType: "text/plain",
        size: 1,
      });

      const count = await service.deleteForIssue("repo", "issue");
      expect(count).toBe(2);

      const remaining = await service.listForIssue("repo", "issue");
      expect(remaining).toHaveLength(0);
    });
  });

  describe("getContent", () => {
    it("reads attachment content", async () => {
      const original = Buffer.from("hello world");
      const result = await service.store("repo", "issue", original, {
        source: "jira",
        sourceId: "content-test",
        filename: "hello.txt",
        mimeType: "text/plain",
        size: original.length,
      });

      const content = await service.getContent(result.localPath);
      expect(content.toString()).toBe("hello world");
    });
  });
});
