/**
 * Tests for Jira plugin definition.
 */

import { describe, expect, it } from "vitest";
import { jiraPlugin, JiraConfigSchema } from "../index.ts";
import { PluginSymbol } from "workhorse-core";

describe("jiraPlugin", () => {
  it("is a valid Workhorse plugin", () => {
    expect(jiraPlugin[PluginSymbol]).toBe(true);
  });

  it("has correct manifest", () => {
    expect(jiraPlugin.manifest.name).toBe("jira");
    expect(jiraPlugin.manifest.version).toBe("1.0.0");
    expect(jiraPlugin.manifest.capabilities).toEqual({
      parsers: ["jira"],
      monitors: ["jira-comments"],
      tools: ["jira_add_comment", "jira_transition_issue", "jira_get_comments"],
    });
  });

  it("has a configSchema", () => {
    expect(jiraPlugin).toHaveProperty("setup");
  });
});

describe("JiraConfigSchema", () => {
  it("validates valid config", () => {
    const result = JiraConfigSchema.safeParse({
      cloudId: "company.atlassian.net",
      pollInterval: 30000,
    });
    expect(result.success).toBe(true);
  });

  it("applies default pollInterval", () => {
    const result = JiraConfigSchema.safeParse({
      cloudId: "company.atlassian.net",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pollInterval).toBe(30000);
    }
  });

  it("rejects invalid pollInterval", () => {
    const result = JiraConfigSchema.safeParse({
      pollInterval: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("plugin setup", () => {
  it.fails("TODO: integrates with Workhorse context", async () => {
    throw new Error("Not yet implemented");
  });
});
