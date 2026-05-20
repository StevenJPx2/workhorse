/**
 * Tests for the Figma TUI renderer.
 */

import { describe, expect, it } from "vitest";
import { figmaRenderer } from "../renderer.ts";
import type { ActivityInput } from "../renderer.ts";
import type { Notification } from "workhorse-core";

// Helpers

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    issueId: "issue-1",
    source: "figma",
    sourceId: "figma-comment-c1",
    title: "New Figma comment from alice",
    body: "Looks great!",
    priority: "normal",
    status: "unread",
    metadata: { fileKey: "abc123", author: "alice" },
    createdAt: new Date(),
    ...overrides,
  } as Notification;
}

// Notification rendering

describe("figmaRenderer — notifications", () => {
  it("returns null for non-figma notifications", () => {
    const input: ActivityInput = {
      kind: "notification",
      notification: makeNotification({ source: "jira" }),
    };
    expect(figmaRenderer(input)).toBeNull();
  });

  it("renders a figma comment notification", () => {
    const result = figmaRenderer({
      kind: "notification",
      notification: makeNotification(),
    });
    expect(result).not.toBeNull();
    expect(result!.style).toBe("box");
    expect(result!.title).toBe("New Figma comment from alice");
    expect(result!.subtitle).toContain("abc123");
    expect(result!.subtitle).toContain("alice");
    expect(result!.body).toBe("Looks great!");
  });

  it("uses the comment icon for comment notifications", () => {
    const result = figmaRenderer({
      kind: "notification",
      notification: makeNotification({ title: "New comment from alice" }),
    });
    // comment icon should be 💬 or ↩️
    expect(["💬", "↩️"]).toContain(result!.icon);
  });

  it("uses the file-update icon for file update notifications", () => {
    const result = figmaRenderer({
      kind: "notification",
      notification: makeNotification({ title: "Figma file updated" }),
    });
    expect(result!.icon).toBe("🔄");
    expect(result!.color).toBe("accent");
  });

  it("uses the reply icon when title contains 'replied' and metadata.isReply is true", () => {
    const result = figmaRenderer({
      kind: "notification",
      notification: makeNotification({
        title: "alice replied on Figma",
        metadata: { isReply: true, fileKey: "abc123", author: "alice" },
      }),
    });
    // Renderer checks for "replied" in the title and uses isReply metadata for icon selection
    expect(result!.icon).toBe("↩️");
  });

  it("omits subtitle parts when metadata is absent", () => {
    const result = figmaRenderer({
      kind: "notification",
      notification: makeNotification({ metadata: undefined }),
    });
    expect(result!.subtitle).toBeUndefined();
  });
});

// Tool-call rendering

describe("figmaRenderer — tool calls", () => {
  it("returns null for non-figma tools", () => {
    const result = figmaRenderer({ kind: "tool", tool: "jira_add_comment", args: {} });
    expect(result).toBeNull();
  });

  it("renders figma_get_file inline", () => {
    const result = figmaRenderer({ kind: "tool", tool: "figma_get_file", args: { depth: 3 } });
    expect(result).not.toBeNull();
    expect(result!.style).toBe("inline");
    expect(result!.title).toContain("Figma file");
    expect(result!.subtitle).toContain("depth=3");
  });

  it("renders figma_get_file without subtitle when no depth arg", () => {
    const result = figmaRenderer({ kind: "tool", tool: "figma_get_file", args: {} });
    expect(result!.subtitle).toBeUndefined();
  });

  it("renders figma_get_comments inline with resolution filter label", () => {
    const result = figmaRenderer({
      kind: "tool",
      tool: "figma_get_comments",
      args: { includeResolved: false },
    });
    expect(result!.style).toBe("inline");
    expect(result!.subtitle).toContain("open only");
  });

  it("shows 'including resolved' subtitle when includeResolved=true", () => {
    const result = figmaRenderer({
      kind: "tool",
      tool: "figma_get_comments",
      args: { includeResolved: true },
    });
    expect(result!.subtitle).toContain("including resolved");
  });

  it("renders figma_post_comment as a box with message preview", () => {
    const result = figmaRenderer({
      kind: "tool",
      tool: "figma_post_comment",
      args: { message: "Implementation looks good, small question about spacing." },
    });
    expect(result!.style).toBe("box");
    expect(result!.subtitle).toContain("Implementation looks good");
  });

  it("truncates long messages in the subtitle", () => {
    const longMessage = "a".repeat(120);
    const result = figmaRenderer({
      kind: "tool",
      tool: "figma_post_comment",
      args: { message: longMessage },
    });
    expect(result!.subtitle!.length).toBeLessThanOrEqual(84); // 80 chars + "…"
  });

  it("shows reply title when replyToId is present", () => {
    const result = figmaRenderer({
      kind: "tool",
      tool: "figma_post_comment",
      args: { message: "Thanks!", replyToId: "c1" },
    });
    expect(result!.title).toContain("Replying");
  });

  it("returns null for unknown figma_ tool", () => {
    const result = figmaRenderer({
      kind: "tool",
      tool: "figma_unknown_tool",
      args: {},
    });
    expect(result).toBeNull();
  });
});
