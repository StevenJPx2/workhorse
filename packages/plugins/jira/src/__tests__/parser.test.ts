/**
 * Tests for Jira issue parser.
 */

import { describe, expect, it, vi } from "vitest";
import type { AtlassianClient } from "../client.ts";
import { canParseJira, createJiraParserOptions } from "../parser.ts";

describe("canParseJira", () => {
  it("matches Jira ticket keys", () => {
    expect(canParseJira("AM-123")).toBe(true);
    expect(canParseJira("PROJ-456")).toBe(true);
    expect(canParseJira("MYPROJECT-9999")).toBe(true);
  });

  it("matches Jira URLs", () => {
    expect(canParseJira("https://company.atlassian.net/browse/AM-123")).toBe(true);
    expect(canParseJira("https://jira.example.com/browse/PROJ-42")).toBe(false); // Not atlassian.net
  });

  it("rejects non-jira input", () => {
    expect(canParseJira("123-AM")).toBe(false);
    expect(canParseJira("just some text")).toBe(false);
    expect(canParseJira("github.com/user/repo#42")).toBe(false);
  });
});

describe("createJiraParserOptions", () => {
  it("parses ticket key input", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-123",
        self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
        fields: {
          summary: "Test",
          status: { name: "To Do", id: "1" },
        },
      }),
    } as unknown as AtlassianClient;

    const options = createJiraParserOptions(mockClient);
    expect(options.source).toBe("jira");
    expect(options.canParse("AM-123")).toBe(true);

    const parsed = await options.parse("AM-123");
    expect(mockClient.fetchIssue).toHaveBeenCalledWith("AM-123");
    expect(parsed.externalId).toBe("AM-123");
  });

  it("extracts key from Jira URL input", async () => {
    const mockClient = {
      fetchIssue: vi.fn().mockResolvedValue({
        key: "AM-456",
        self: "https://test.atlassian.net/rest/api/3/issue/AM-456",
        fields: {
          summary: "Test",
          status: { name: "To Do", id: "1" },
        },
      }),
    } as unknown as AtlassianClient;

    const options = createJiraParserOptions(mockClient);
    const parsed = await options.parse("https://company.atlassian.net/browse/AM-456");
    expect(mockClient.fetchIssue).toHaveBeenCalledWith("AM-456");
    expect(parsed.externalId).toBe("AM-456");
  });
});
