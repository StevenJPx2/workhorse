import { describe, expect, it } from "vitest";

import type { Notification } from "#db";

import { skillRenderer, workhorseToolRenderer, notificationRenderer } from "../renderers.ts";

describe("skillRenderer", () => {
  it("renders load_skill tool", () => {
    const result = skillRenderer({
      kind: "tool",
      tool: "load_skill",
      args: { skillId: "builtin:plugin-development" },
    });

    expect(result).toEqual({
      icon: "📖",
      title: "loaded skill: builtin:plugin-development",
      style: "inline",
      color: "accent",
    });
  });

  it("handles missing skillId gracefully", () => {
    const result = skillRenderer({
      kind: "tool",
      tool: "load_skill",
      args: {},
    });

    expect(result).toEqual({
      icon: "📖",
      title: "loaded skill: unknown",
      style: "inline",
      color: "accent",
    });
  });

  it("returns null for non-load_skill tools", () => {
    const result = skillRenderer({
      kind: "tool",
      tool: "some_other_tool",
      args: {},
    });

    expect(result).toBeNull();
  });

  it("returns null for notification inputs", () => {
    const result = skillRenderer({
      kind: "notification",
      notification: { id: "1", title: "Test" } as Notification,
    });

    expect(result).toBeNull();
  });
});

describe("workhorseToolRenderer", () => {
  it("renders workhorse_update_status", () => {
    const result = workhorseToolRenderer({
      kind: "tool",
      tool: "workhorse_update_status",
      args: { status: "implementing" },
    });

    expect(result).toEqual({
      icon: "⚡",
      title: "status → implementing",
      style: "inline",
      color: "info",
    });
  });

  it("renders workhorse_escalate (blocking)", () => {
    const result = workhorseToolRenderer({
      kind: "tool",
      tool: "workhorse_escalate",
      args: { message: "Need help", blocking: true },
    });

    expect(result).toEqual({
      icon: "🚨",
      title: "BLOCKED",
      body: "Need help",
      style: "box",
      color: "error",
    });
  });

  it("renders workhorse_acknowledge", () => {
    const result = workhorseToolRenderer({
      kind: "tool",
      tool: "workhorse_acknowledge",
      args: {},
    });

    expect(result).toEqual({
      icon: "✓",
      title: "acknowledged notifications",
      style: "inline",
      color: "success",
    });
  });

  it("returns null for non-workhorse tools", () => {
    const result = workhorseToolRenderer({
      kind: "tool",
      tool: "github_create_pr",
      args: {},
    });

    expect(result).toBeNull();
  });
});

describe("notificationRenderer", () => {
  it("renders blocking notification with box style", () => {
    const notification: Notification = {
      id: "1",
      issueId: "issue-1",
      source: "jira",
      sourceId: "PROJ-123",
      title: "PR Review Required",
      body: "Please review the changes",
      priority: "blocking",
      status: "unread",
      createdAt: new Date(),
      readAt: null,
      acknowledgedAt: null,
      metadata: { key: "PROJ-123" },
    };

    const result = notificationRenderer({
      kind: "notification",
      notification,
    });

    expect(result).toEqual({
      icon: "🚫",
      title: "PR Review Required",
      subtitle: "jira · PROJ-123",
      body: "Please review the changes",
      style: "box",
      color: "error",
    });
  });

  it("renders normal notification with inline style", () => {
    const notification: Notification = {
      id: "2",
      issueId: "issue-1",
      source: "github",
      sourceId: "comment-456",
      title: "New Comment",
      body: "Looks good!",
      priority: "normal",
      status: "unread",
      createdAt: new Date(),
      readAt: null,
      acknowledgedAt: null,
      metadata: { author: "john" },
    };

    const result = notificationRenderer({
      kind: "notification",
      notification,
    });

    expect(result).toEqual({
      icon: "📬",
      title: "New Comment",
      subtitle: "github · john",
      body: "Looks good!",
      style: "inline",
      color: "info",
    });
  });

  it("returns null for tool inputs", () => {
    const result = notificationRenderer({
      kind: "tool",
      tool: "load_skill",
      args: {},
    });

    expect(result).toBeNull();
  });
});
