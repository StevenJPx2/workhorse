/**
 * Tests for GitHub plugin entry point.
 */

import { describe, expect, it } from "vitest";
import { githubPlugin, GitHubConfigSchema } from "../index.ts";

describe("githubPlugin", () => {
  it("has correct manifest", () => {
    expect(githubPlugin.manifest.name).toBe("github");
    expect(githubPlugin.manifest.version).toBe("1.0.0");
    expect(githubPlugin.manifest.capabilities?.parsers).toContain("github");
    expect(githubPlugin.manifest.capabilities?.monitors).toContain("github-pr");
    expect(githubPlugin.manifest.capabilities?.tools).toContain("github_open_pr");
    expect(githubPlugin.manifest.capabilities?.tools).toContain("github_add_comment");
    expect(githubPlugin.manifest.capabilities?.tools).toContain("github_get_pr_status");
  });
});

describe("GitHubConfigSchema", () => {
  it("has default pollInterval", () => {
    const parsed = GitHubConfigSchema.parse({});
    expect(parsed.pollInterval).toBe(30000);
  });

  it("accepts custom pollInterval", () => {
    const parsed = GitHubConfigSchema.parse({ pollInterval: 60000 });
    expect(parsed.pollInterval).toBe(60000);
  });

  it("rejects invalid pollInterval", () => {
    expect(() => GitHubConfigSchema.parse({ pollInterval: -1000 })).toThrow();
    expect(() => GitHubConfigSchema.parse({ pollInterval: 0 })).toThrow();
  });
});
