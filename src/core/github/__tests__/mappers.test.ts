/**
 * Tests for GitHub MCP client mappers
 *
 * Pure function tests with no external dependencies.
 */

import { describe, it, expect } from "bun:test";
import {
  mapPullRequest,
  mapReviewComment,
  mapPRReview,
  parseMcpResponse,
  extractTextContent,
} from "../mappers.ts";
// Types are used indirectly via mapper function return types

describe("mapPullRequest", () => {
  it("maps a complete raw PR response", () => {
    const raw = {
      number: 42,
      title: "Fix auth timeout",
      body: "This fixes the timeout issue",
      state: "open",
      draft: false,
      head: { ref: "feat/AM-123" },
      base: { ref: "main" },
      html_url: "https://github.com/org/repo/pull/42",
      user: { login: "developer" },
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
      mergeable_state: "clean",
      additions: 100,
      deletions: 50,
      changed_files: 5,
    };

    const result = mapPullRequest(raw);

    expect(result.number).toBe(42);
    expect(result.title).toBe("Fix auth timeout");
    expect(result.body).toBe("This fixes the timeout issue");
    expect(result.state).toBe("open");
    expect(result.draft).toBe(false);
    expect(result.headBranch).toBe("feat/AM-123");
    expect(result.baseBranch).toBe("main");
    expect(result.url).toBe("https://github.com/org/repo/pull/42");
    expect(result.author).toBe("developer");
    expect(result.additions).toBe(100);
    expect(result.deletions).toBe(50);
    expect(result.changedFiles).toBe(5);
  });

  it("handles missing fields with defaults", () => {
    const raw = {};

    const result = mapPullRequest(raw);

    expect(result.number).toBe(0);
    expect(result.title).toBe("");
    expect(result.body).toBeNull();
    expect(result.state).toBe("open");
    expect(result.draft).toBe(false);
    expect(result.headBranch).toBe("");
    expect(result.baseBranch).toBe("");
    expect(result.url).toBe("");
    expect(result.author).toBe("");
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.changedFiles).toBe(0);
    expect(result.mergeableState).toBeNull();
  });

  it("handles null body", () => {
    const raw = { number: 1, title: "PR", body: null };

    const result = mapPullRequest(raw);

    expect(result.body).toBeNull();
  });
});

describe("mapReviewComment", () => {
  it("maps a complete review comment", () => {
    const raw = {
      id: 100,
      pull_request_review_id: 200,
      user: { login: "reviewer" },
      body: "Consider using exponential backoff",
      path: "src/auth.ts",
      line: 42,
      original_line: 42,
      side: "RIGHT",
      is_obsolete: false,
      created_at: "2025-01-01T12:00:00Z",
      updated_at: "2025-01-01T12:00:00Z",
      in_reply_to_id: null,
    };

    const result = mapReviewComment(raw);

    expect(result.id).toBe(100);
    expect(result.reviewId).toBe(200);
    expect(result.user).toBe("reviewer");
    expect(result.body).toBe("Consider using exponential backoff");
    expect(result.path).toBe("src/auth.ts");
    expect(result.line).toBe(42);
    expect(result.originalLine).toBe(42);
    expect(result.side).toBe("RIGHT");
    expect(result.isResolved).toBe(false);
    expect(result.inReplyToId).toBeNull();
  });

  it("handles comment with no file path (general comment)", () => {
    const raw = {
      id: 101,
      pull_request_review_id: null,
      user: { login: "bot" },
      body: "LGTM",
      path: null,
      line: null,
      created_at: "2025-01-01T12:00:00Z",
      updated_at: "2025-01-01T12:00:00Z",
      in_reply_to_id: null,
    };

    const result = mapReviewComment(raw);

    expect(result.path).toBeNull();
    expect(result.line).toBeNull();
    expect(result.reviewId).toBeNull();
  });

  it("handles reply comment", () => {
    const raw = {
      id: 102,
      pull_request_review_id: 200,
      user: { login: "author" },
      body: "Good point, will fix",
      path: "src/auth.ts",
      line: 42,
      created_at: "2025-01-01T12:30:00Z",
      updated_at: "2025-01-01T12:30:00Z",
      in_reply_to_id: 100,
    };

    const result = mapReviewComment(raw);

    expect(result.inReplyToId).toBe(100);
  });

  it("handles empty raw object with defaults", () => {
    const raw = {};

    const result = mapReviewComment(raw);

    expect(result.id).toBe(0);
    expect(result.user).toBe("");
    expect(result.body).toBe("");
    expect(result.path).toBeNull();
    expect(result.line).toBeNull();
  });
});

describe("mapPRReview", () => {
  it("maps a complete PR review", () => {
    const raw = {
      id: 300,
      user: { login: "senior-dev" },
      state: "CHANGES_REQUESTED",
      body: "Please add more tests",
      submitted_at: "2025-01-01T11:00:00Z",
    };

    const result = mapPRReview(raw);

    expect(result.id).toBe(300);
    expect(result.user).toBe("senior-dev");
    expect(result.state).toBe("CHANGES_REQUESTED");
    expect(result.body).toBe("Please add more tests");
    expect(result.submittedAt).toBe("2025-01-01T11:00:00Z");
  });

  it("maps an approved review", () => {
    const raw = {
      id: 301,
      user: { login: "tech-lead" },
      state: "APPROVED",
      body: "Looks good!",
      submitted_at: "2025-01-01T11:30:00Z",
    };

    const result = mapPRReview(raw);

    expect(result.state).toBe("APPROVED");
  });

  it("defaults state to PENDING when missing", () => {
    const raw = { id: 302 };

    const result = mapPRReview(raw);

    expect(result.state).toBe("PENDING");
  });

  it("handles empty object", () => {
    const result = mapPRReview({});

    expect(result.id).toBe(0);
    expect(result.user).toBe("");
    expect(result.body).toBe("");
    expect(result.submittedAt).toBe("");
  });
});

describe("parseMcpResponse", () => {
  it("parses valid JSON", () => {
    const result = parseMcpResponse('{"number": 42, "title": "Test PR"}');
    expect(result).toEqual({ number: 42, title: "Test PR" });
  });

  it("parses JSON arrays", () => {
    const result = parseMcpResponse('[{"id": 1}, {"id": 2}]');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseMcpResponse("not json")).toThrow("Failed to parse GitHub MCP response");
  });

  it("includes truncated text in error for long responses", () => {
    const longText = "x".repeat(300);
    expect(() => parseMcpResponse(longText)).toThrow("...");
  });
});

describe("extractTextContent", () => {
  it("extracts text from MCP content array", () => {
    const content = [{ type: "text", text: '{"number": 42}' }];

    const result = extractTextContent(content);
    expect(result).toBe('{"number": 42}');
  });

  it("throws when no text content found", () => {
    const content = [{ type: "image", data: "abc" }];

    expect(() => extractTextContent(content)).toThrow("No text content in GitHub MCP response");
  });

  it("throws on empty content array", () => {
    expect(() => extractTextContent([])).toThrow("No text content in GitHub MCP response");
  });

  it("handles content with text property missing", () => {
    const content = [{ type: "text" }];

    expect(() => extractTextContent(content)).toThrow("No text content in GitHub MCP response");
  });

  it("prefers text type over other types", () => {
    const content = [
      { type: "image", data: "abc" },
      { type: "text", text: '{"result": true}' },
    ];

    const result = extractTextContent(content);
    expect(result).toBe('{"result": true}');
  });
});
