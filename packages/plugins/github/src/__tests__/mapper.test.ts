/**
 * Tests for GitHub → ParsedIssue mapper.
 */

import { describe, expect, it } from "vitest";

import { mapGitHubToIssue } from "../mapper.ts";
import type { GitHubIssue } from "../types.ts";

describe("mapGitHubToIssue", () => {
  it("maps a full GitHub issue to ParsedIssue", () => {
    const ghIssue: GitHubIssue = {
      owner: "octocat",
      repo: "hello-world",
      number: 42,
      title: "Add dark mode",
      body: "Users want dark mode for the UI.",
      state: "open",
      html_url: "https://github.com/octocat/hello-world/issues/42",
      assignee: { login: "alice" },
      labels: [{ name: "enhancement" }, { name: "ui" }],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);

    expect(parsed.externalId).toBe("octocat/hello-world#42");
    expect(parsed.source).toBe("github");
    expect(parsed.title).toBe("Add dark mode");
    expect(parsed.description).toBe("Users want dark mode for the UI.");
    expect(parsed.issueType).toBe("story"); // "enhancement" label → story
    expect(parsed.url).toBe("https://github.com/octocat/hello-world/issues/42");
    expect(parsed.assignee).toBe("alice");
    expect(parsed.labels).toEqual(["enhancement", "ui"]);
    expect(parsed.metadata.owner).toBe("octocat");
    expect(parsed.metadata.repo).toBe("hello-world");
    expect(parsed.metadata.number).toBe(42);
    expect(parsed.metadata.state).toBe("open");
    expect(parsed.metadata.isPR).toBe(false);
  });

  it("handles missing optional fields gracefully", () => {
    const ghIssue: GitHubIssue = {
      owner: "org",
      repo: "project",
      number: 1,
      title: "Fix bug",
      body: null,
      state: "closed",
      html_url: "https://github.com/org/project/issues/1",
      assignee: null,
      labels: [],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);

    expect(parsed.externalId).toBe("org/project#1");
    expect(parsed.title).toBe("Fix bug");
    expect(parsed.description).toBe("");
    expect(parsed.assignee).toBeUndefined();
    expect(parsed.labels).toEqual([]);
  });

  it("infers bug type from bug label", () => {
    const ghIssue: GitHubIssue = {
      owner: "org",
      repo: "project",
      number: 2,
      title: "Something broken",
      body: "Description",
      state: "open",
      html_url: "https://github.com/org/project/issues/2",
      assignee: null,
      labels: [{ name: "bug" }, { name: "critical" }],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);
    expect(parsed.issueType).toBe("bug");
  });

  it("infers story type from feature label", () => {
    const ghIssue: GitHubIssue = {
      owner: "org",
      repo: "project",
      number: 3,
      title: "New feature",
      body: "Description",
      state: "open",
      html_url: "https://github.com/org/project/issues/3",
      assignee: null,
      labels: [{ name: "feature" }],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);
    expect(parsed.issueType).toBe("story");
  });

  it("infers epic type from epic label", () => {
    const ghIssue: GitHubIssue = {
      owner: "org",
      repo: "project",
      number: 4,
      title: "Epic work",
      body: "Description",
      state: "open",
      html_url: "https://github.com/org/project/issues/4",
      assignee: null,
      labels: [{ name: "epic" }],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);
    expect(parsed.issueType).toBe("epic");
  });

  it("defaults to task type when no matching labels", () => {
    const ghIssue: GitHubIssue = {
      owner: "org",
      repo: "project",
      number: 5,
      title: "Random task",
      body: "Description",
      state: "open",
      html_url: "https://github.com/org/project/issues/5",
      assignee: null,
      labels: [{ name: "documentation" }],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);
    expect(parsed.issueType).toBe("task");
  });

  it("detects PR from pull_request field", () => {
    const ghIssue: GitHubIssue = {
      owner: "org",
      repo: "project",
      number: 10,
      title: "PR title",
      body: "PR body",
      state: "open",
      html_url: "https://github.com/org/project/pull/10",
      assignee: null,
      labels: [],
      pull_request: { url: "https://api.github.com/repos/org/project/pulls/10" },
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    const parsed = mapGitHubToIssue(ghIssue);
    expect(parsed.metadata.isPR).toBe(true);
  });
});
