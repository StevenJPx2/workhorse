/**
 * Tests for GitHub issue/PR parser.
 */
import { describe, expect, it, vi } from "vitest";

import type { GitHubClient } from "../client.ts";
import {
  canParseGitHub,
  createGitHubParserOptions,
  parseGitHubRef,
} from "../parser.ts";

describe("parseGitHubRef", () => {
  it("parses short form owner/repo#number", () => {
    const ref = parseGitHubRef("octocat/hello-world#42");
    expect(ref).toEqual({
      owner: "octocat",
      repo: "hello-world",
      number: 42,
      type: "issue",
    });
  });

  it("parses GitHub issue URL", () => {
    const ref = parseGitHubRef(
      "https://github.com/octocat/hello-world/issues/42",
    );
    expect(ref).toEqual({
      owner: "octocat",
      repo: "hello-world",
      number: 42,
      type: "issue",
    });
  });

  it("parses GitHub PR URL", () => {
    const ref = parseGitHubRef(
      "https://github.com/octocat/hello-world/pull/123",
    );
    expect(ref).toEqual({
      owner: "octocat",
      repo: "hello-world",
      number: 123,
      type: "pull",
    });
  });

  it("handles repos with dots and underscores", () => {
    const ref = parseGitHubRef("my_org/my.repo_name#99");
    expect(ref).toEqual({
      owner: "my_org",
      repo: "my.repo_name",
      number: 99,
      type: "issue",
    });
  });

  it("returns null for non-GitHub input", () => {
    expect(parseGitHubRef("AM-123")).toBeNull();
    expect(parseGitHubRef("just some text")).toBeNull();
    expect(parseGitHubRef("https://gitlab.com/user/repo/issues/1")).toBeNull();
  });
});

describe("canParseGitHub", () => {
  it("matches short form refs", () => {
    expect(canParseGitHub("octocat/hello-world#42")).toBe(true);
    expect(canParseGitHub("my-org/my-repo#1")).toBe(true);
  });

  it("matches GitHub URLs", () => {
    expect(canParseGitHub("https://github.com/user/repo/issues/1")).toBe(true);
    expect(canParseGitHub("https://github.com/user/repo/pull/99")).toBe(true);
  });

  it("rejects non-GitHub input", () => {
    expect(canParseGitHub("AM-123")).toBe(false);
    expect(canParseGitHub("not a ref")).toBe(false);
    expect(canParseGitHub("https://gitlab.com/user/repo/issues/1")).toBe(false);
  });
});

describe("createGitHubParserOptions", () => {
  it("parses short form input and fetches issue", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        owner: "octocat",
        repo: "hello-world",
        number: 42,
        title: "Test issue",
        body: "Issue body",
        state: "open",
        html_url: "https://github.com/octocat/hello-world/issues/42",
        assignee: { login: "alice" },
        labels: [{ name: "bug" }],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      }),
    } as unknown as GitHubClient;

    const options = createGitHubParserOptions(mockClient);
    expect(options.source).toBe("github");
    expect(options.canParse("octocat/hello-world#42")).toBe(true);

    const parsed = await options.parse("octocat/hello-world#42");
    expect(mockClient.fetchIssue).toHaveBeenCalledWith(
      "octocat",
      "hello-world",
      42,
    );
    expect(parsed.externalId).toBe("octocat/hello-world#42");
    expect(parsed.source).toBe("github");
    expect(parsed.title).toBe("Test issue");
  });

  it("parses URL input and extracts owner/repo/number", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        owner: "org",
        repo: "project",
        number: 123,
        title: "Feature request",
        body: null,
        state: "open",
        html_url: "https://github.com/org/project/issues/123",
        assignee: null,
        labels: [],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      }),
    } as unknown as GitHubClient;

    const options = createGitHubParserOptions(mockClient);
    const parsed = await options.parse(
      "https://github.com/org/project/issues/123",
    );
    expect(mockClient.fetchIssue).toHaveBeenCalledWith("org", "project", 123);
    expect(parsed.externalId).toBe("org/project#123");
  });
});
