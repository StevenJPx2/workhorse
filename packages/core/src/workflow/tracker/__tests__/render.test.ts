import { describe, expect, it } from "vitest";

import type { Issue } from "#db";
import type { SearchResult, SessionMemory } from "#services/memory";

import {
  buildInitialPrompt,
  buildResumePrompt,
  renderContextBlock,
  renderIssueSection,
  renderSearchResults,
  sortContextBlocks,
} from "../render.ts";
import type { PromptContextBlock } from "../types.ts";

const createMockIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: "test-uuid",
  externalId: "AM-123",
  source: "test-source",
  repository: null,
  title: "Test Issue Title",
  description: "Test issue description",
  status: "pending",
  issueType: "task",
  url: null,
  assignee: null,
  labels: null,
  metadata: {},
  worktreePath: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

describe("render", () => {
  describe("renderIssueSection", () => {
    it("renders basic issue information", () => {
      const issue = createMockIssue();
      const result = renderIssueSection(issue);

      expect(result).toContain("## Issue: AM-123");
      expect(result).toContain("**Title**: Test Issue Title");
      expect(result).toContain("**Type**: task");
      expect(result).toContain("**Status**: pending");
    });

    it("includes optional fields when present", () => {
      const issue = createMockIssue({
        url: "https://jira.example.com/AM-123",
        assignee: "john.doe",
        labels: ["urgent", "backend"],
      });
      const result = renderIssueSection(issue);

      expect(result).toContain("**URL**: https://jira.example.com/AM-123");
      expect(result).toContain("**Assignee**: john.doe");
      expect(result).toContain("**Labels**: urgent, backend");
    });
  });

  describe("renderContextBlock", () => {
    it("renders a context block with title and content", () => {
      const block: PromptContextBlock = {
        id: "test-block",
        title: "Test Block",
        content: "Test content here",
      };
      const result = renderContextBlock(block);

      expect(result).toBe("## Test Block\n\nTest content here");
    });
  });

  describe("renderSearchResults", () => {
    it("returns empty string for empty results", () => {
      const result = renderSearchResults([]);
      expect(result).toBe("");
    });

    it("renders results with metadata type", () => {
      const results: SearchResult[] = [
        { id: "1", score: 0.95, content: "Result content", metadata: { type: "decision" } },
      ];
      const result = renderSearchResults(results);

      expect(result).toContain("## Related Context");
      expect(result).toContain("### decision (score: 0.95)");
      expect(result).toContain("Result content");
    });

    it("uses 'context' as fallback when metadata type is missing", () => {
      const results: SearchResult[] = [{ id: "1", score: 0.8, content: "Result content" }];
      const result = renderSearchResults(results);

      expect(result).toContain("### context (score: 0.80)");
    });

    it("uses 'context' as fallback when metadata is empty object", () => {
      const results: SearchResult[] = [
        { id: "1", score: 0.75, content: "Result content", metadata: {} },
      ];
      const result = renderSearchResults(results);

      expect(result).toContain("### context (score: 0.75)");
    });

    it("filters out results without content", () => {
      const results: SearchResult[] = [
        { id: "1", score: 0.9, content: "Has content", metadata: { type: "a" } },
        { id: "2", score: 0.8, metadata: { type: "b" } }, // no content
        { id: "3", score: 0.7, content: "", metadata: { type: "c" } }, // empty content (falsy)
      ];
      const result = renderSearchResults(results);

      expect(result).toContain("Has content");
      expect(result).not.toContain("### b");
      // Empty string is falsy, so it's filtered out
    });
  });

  describe("sortContextBlocks", () => {
    it("sorts blocks by priority (lower first)", () => {
      const blocks: PromptContextBlock[] = [
        { id: "c", title: "C", content: "c", priority: 10 },
        { id: "a", title: "A", content: "a", priority: -100 },
        { id: "b", title: "B", content: "b", priority: 0 },
      ];
      const sorted = sortContextBlocks(blocks);

      expect(sorted[0]!.id).toBe("a");
      expect(sorted[1]!.id).toBe("b");
      expect(sorted[2]!.id).toBe("c");
    });

    it("treats undefined priority as 0", () => {
      const blocks: PromptContextBlock[] = [
        { id: "a", title: "A", content: "a", priority: 5 },
        { id: "b", title: "B", content: "b" }, // no priority
        { id: "c", title: "C", content: "c", priority: -5 },
      ];
      const sorted = sortContextBlocks(blocks);

      expect(sorted[0]!.id).toBe("c");
      expect(sorted[1]!.id).toBe("b");
      expect(sorted[2]!.id).toBe("a");
    });

    it("does not mutate original array", () => {
      const blocks: PromptContextBlock[] = [
        { id: "b", title: "B", content: "b", priority: 10 },
        { id: "a", title: "A", content: "a", priority: -10 },
      ];
      sortContextBlocks(blocks);

      expect(blocks[0]!.id).toBe("b");
    });
  });

  describe("buildInitialPrompt", () => {
    it("builds prompt for starting work", () => {
      const issue = createMockIssue();
      const result = buildInitialPrompt(issue);

      expect(result).toContain("## Task");
      expect(result).toContain("You are starting work on issue **AM-123**: Test Issue Title");
      expect(result).toContain("Test issue description");
    });

    it("shows fallback for empty description", () => {
      const issue = createMockIssue({ description: "" });
      const result = buildInitialPrompt(issue);

      expect(result).toContain("No description provided");
    });

    it("shows fallback for null description", () => {
      const issue = createMockIssue({ description: null as unknown as string });
      const result = buildInitialPrompt(issue);

      expect(result).toContain("No description provided");
    });
  });

  describe("buildResumePrompt", () => {
    it("builds prompt for resuming work", () => {
      const issue = createMockIssue({ status: "implementing" });
      const result = buildResumePrompt(issue);

      expect(result).toContain("## Resuming Work");
      expect(result).toContain("You are resuming work on issue **AM-123**: Test Issue Title");
      expect(result).toContain("Current status: **implementing**");
    });

    it("includes session memory patterns", () => {
      const issue = createMockIssue();
      const memory: SessionMemory = {
        title: "AM-123: Test",
        patterns: ["Use TypeScript", "Write tests first"],
        sessions: [],
        latestStatus: "implementing",
      };
      const result = buildResumePrompt(issue, memory);

      expect(result).toContain("### Codebase Patterns");
      expect(result).toContain("Use TypeScript");
      expect(result).toContain("Write tests first");
    });

    it("includes last session details", () => {
      const issue = createMockIssue();
      const memory: SessionMemory = {
        title: "AM-123: Test",
        patterns: [],
        sessions: [
          {
            timestamp: new Date("2024-01-15T10:00:00Z"),
            status: "planning",
            summary: ["Analyzed requirements"],
            learnings: ["API uses REST"],
            filesChanged: ["src/api.ts"],
          },
        ],
        latestStatus: "implementing",
      };
      const result = buildResumePrompt(issue, memory);

      expect(result).toContain("### Last Session");
      expect(result).toContain("2024-01-15");
      expect(result).toContain("Analyzed requirements");
      expect(result).toContain("**Learnings**");
      expect(result).toContain("API uses REST");
      expect(result).toContain("**Files Changed**");
      expect(result).toContain("src/api.ts");
    });

    it("omits learnings section when empty", () => {
      const issue = createMockIssue();
      const memory: SessionMemory = {
        title: "AM-123: Test",
        patterns: [],
        sessions: [
          {
            timestamp: new Date("2024-01-15"),
            status: "planning",
            summary: ["Did work"],
            learnings: [],
            filesChanged: ["file.ts"],
          },
        ],
        latestStatus: "implementing",
      };
      const result = buildResumePrompt(issue, memory);

      expect(result).not.toContain("**Learnings**");
    });

    it("omits files changed section when empty", () => {
      const issue = createMockIssue();
      const memory: SessionMemory = {
        title: "AM-123: Test",
        patterns: [],
        sessions: [
          {
            timestamp: new Date("2024-01-15"),
            status: "planning",
            summary: ["Did work"],
            learnings: ["Learned something"],
            filesChanged: [],
          },
        ],
        latestStatus: "implementing",
      };
      const result = buildResumePrompt(issue, memory);

      expect(result).not.toContain("**Files Changed**");
    });

    it("omits patterns section when empty", () => {
      const issue = createMockIssue();
      const memory: SessionMemory = {
        title: "AM-123: Test",
        patterns: [],
        sessions: [],
        latestStatus: "implementing",
      };
      const result = buildResumePrompt(issue, memory);

      expect(result).not.toContain("### Codebase Patterns");
    });

    it.fails("TODO: buildResumePrompt should validate session timestamps", () => {
      // Currently buildResumePrompt doesn't validate that session timestamps
      // are valid dates. Future enhancement: validate and handle invalid dates.
      const issue = createMockIssue();
      const memory: SessionMemory = {
        title: "AM-123: Test",
        patterns: [],
        sessions: [
          {
            timestamp: new Date("invalid"), // Invalid date
            status: "planning",
            summary: ["Did work"],
            learnings: [],
            filesChanged: [],
          },
        ],
        latestStatus: "implementing",
      };

      // This should either throw or handle gracefully (not produce "Invalid Date")
      const result = buildResumePrompt(issue, memory);
      expect(result).not.toContain("Invalid Date");
    });
  });
});
