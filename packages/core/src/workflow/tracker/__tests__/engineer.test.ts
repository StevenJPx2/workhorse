import { describe, expect, it, vi } from "vitest";
import type { Issue } from "#db";
import { PromptEngineer } from "#workflow/tracker";

const createMockMemory = () => ({
  l1: {
    get: vi.fn(),
  },
  l2: {
    search: vi.fn().mockResolvedValue([]),
  },
  notifications: {
    getUnread: vi.fn().mockReturnValue([]),
    generateInbox: vi.fn().mockReturnValue("<inbox />"),
  },
});

const createMockIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: "test-uuid",
  externalId: "AM-123",
  source: "jira",
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

describe("PromptEngineer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildPrompt", () => {
    it("builds initial prompt when isResume is false", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt({ isResume: false });

      expect(prompt).toContain("## Task");
      expect(prompt).toContain("You are starting work on issue");
      expect(prompt).toContain("AM-123");
      expect(prompt).toContain("Test Issue Title");
    });

    it("builds resume prompt when isResume is true", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue({ status: "implementing" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt({ isResume: true });

      expect(prompt).toContain("## Resuming Work");
      expect(prompt).toContain("You are resuming work on issue");
      expect(prompt).toContain("implementing");
      expect(prompt).toContain("Please continue where you left off");
    });

    it("auto-detects resume when L1 memory exists", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue({
          title: "AM-123: Test Issue",
          patterns: [],
          sessions: [],
          latestStatus: "implementing",
        }),
      });
      const issue = createMockIssue({ worktreePath: "/path/to/worktree" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("## Resuming Work");
    });

    it("includes issue information", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue({
        url: "https://jira.example.com/AM-123",
        assignee: "john.doe",
        labels: ["urgent", "backend"],
      });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("## Issue: AM-123");
      expect(prompt).toContain("**Title**: Test Issue Title");
      expect(prompt).toContain("**Type**: task");
      expect(prompt).toContain("**Status**: pending");
      expect(prompt).toContain("**URL**: https://jira.example.com/AM-123");
      expect(prompt).toContain("**Assignee**: john.doe");
      expect(prompt).toContain("**Labels**: urgent, backend");
    });

    it("omits optional fields when not present", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).not.toContain("**URL**:");
      expect(prompt).not.toContain("**Assignee**:");
      expect(prompt).not.toContain("**Labels**:");
    });

    it("includes custom instructions from config", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any, "Always write tests first");

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("## Custom Instructions");
      expect(prompt).toContain("Always write tests first");
    });

    it("includes search results from L2 memory", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l2.search = vi.fn().mockResolvedValue([
        {
          id: "doc-1",
          score: 0.95,
          content: "Relevant documentation content",
          metadata: { type: "decision" },
        },
        {
          id: "doc-2",
          score: 0.8,
          content: "Another relevant document",
          metadata: { type: "code_context" },
        },
      ]);
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("## Related Context");
      expect(prompt).toContain("decision (score: 0.95)");
      expect(prompt).toContain("Relevant documentation content");
      expect(prompt).toContain("code_context (score: 0.80)");
    });

    it("includes notifications as context block", async () => {
      const mockMemory = createMockMemory();
      mockMemory.notifications.getUnread = vi
        .fn()
        .mockReturnValue([{ id: "notif-1", title: "Test notification" }]);
      mockMemory.notifications.generateInbox = vi
        .fn()
        .mockReturnValue("<system_inbox><notification>Test</notification></system_inbox>");
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("## Pending Notifications");
      expect(mockMemory.notifications.generateInbox).toHaveBeenCalled();
    });

    it("handles empty description", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue({ description: "" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("No description provided");
    });
  });

  describe("resume prompt with session memory", () => {
    it("includes session memory patterns", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue({
          title: "AM-123: Test Issue",
          patterns: ["Use camelCase for function names", "Tests in __tests__ folder"],
          sessions: [],
          latestStatus: "implementing",
        }),
      });
      const issue = createMockIssue({
        worktreePath: "/path/to/worktree",
        status: "implementing",
      });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("### Codebase Patterns");
      expect(prompt).toContain("Use camelCase for function names");
      expect(prompt).toContain("Tests in __tests__ folder");
    });

    it("includes last session details", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue({
          title: "AM-123: Test Issue",
          patterns: [],
          sessions: [
            {
              timestamp: new Date("2024-01-15T10:00:00Z"),
              status: "planning",
              summary: ["Analyzed requirements", "Created plan"],
              learnings: ["API uses REST"],
              filesChanged: ["src/api.ts", "src/types.ts"],
            },
          ],
          latestStatus: "implementing",
        }),
      });
      const issue = createMockIssue({
        worktreePath: "/path/to/worktree",
        status: "implementing",
      });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("### Last Session");
      expect(prompt).toContain("2024-01-15");
      expect(prompt).toContain("planning");
      expect(prompt).toContain("Analyzed requirements");
      expect(prompt).toContain("Created plan");
      expect(prompt).toContain("**Learnings**");
      expect(prompt).toContain("API uses REST");
      expect(prompt).toContain("**Files Changed**");
      expect(prompt).toContain("src/api.ts");
    });

    it("uses the last session from multiple sessions", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue({
          title: "AM-123: Test Issue",
          patterns: [],
          sessions: [
            {
              timestamp: new Date("2024-01-10"),
              status: "planning",
              summary: ["First session"],
              learnings: [],
              filesChanged: [],
            },
            {
              timestamp: new Date("2024-01-15"),
              status: "implementing",
              summary: ["Second session"],
              learnings: [],
              filesChanged: [],
            },
          ],
          latestStatus: "implementing",
        }),
      });
      const issue = createMockIssue({
        worktreePath: "/path/to/worktree",
        status: "implementing",
      });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const prompt = await engineer.buildPrompt();

      expect(prompt).toContain("Second session");
      expect(prompt).not.toContain("First session");
    });
  });

  describe("buildHybridPrompt", () => {
    it("returns system prompt and initial message separately", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const result = await engineer.buildHybridPrompt();

      expect(result.systemPrompt).toContain("## Issue: AM-123");
      expect(result.initialMessage).toContain("You are starting work on issue");
    });

    it("includes tools section when tools provided", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const tools = [
        {
          name: "update_status",
          description: "Updates the issue status",
          schema: { type: "object" },
          execute: vi.fn(),
        },
        {
          name: "add_comment",
          description: "Adds a comment to the issue",
          schema: { type: "object" },
          execute: vi.fn(),
        },
      ];

      const result = await engineer.buildHybridPrompt({ tools });

      expect(result.systemPrompt).toContain("## Jiratown Tools");
      expect(result.systemPrompt).toContain("### update_status");
      expect(result.systemPrompt).toContain("Updates the issue status");
      expect(result.systemPrompt).toContain("### add_comment");
    });

    it("returns resume prompt when L1 memory exists", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue({
          title: "AM-123: Test Issue",
          patterns: [],
          sessions: [],
          latestStatus: "implementing",
        }),
      });
      const issue = createMockIssue({ worktreePath: "/path/to/worktree" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const result = await engineer.buildHybridPrompt();

      expect(result.initialMessage).toContain("You are resuming work on issue");
    });

    it("respects explicit isResume=false even with L1 memory", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue({
          title: "AM-123: Test Issue",
          patterns: [],
          sessions: [],
          latestStatus: "implementing",
        }),
      });
      const issue = createMockIssue({ worktreePath: "/path/to/worktree" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const result = await engineer.buildHybridPrompt({ isResume: false });

      expect(result.initialMessage).toContain("You are starting work on issue");
    });

    it("skips L2 search when issue has empty title and description", async () => {
      const mockMemory = createMockMemory();
      const issue = createMockIssue({ title: "", description: "" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      await engineer.buildHybridPrompt();

      // Should not call search with empty query
      expect(mockMemory.l2.search).not.toHaveBeenCalled();
    });

    it("handles L1 context returning null from read", async () => {
      const mockMemory = createMockMemory();
      mockMemory.l1.get = vi.fn().mockReturnValue({
        exists: () => true,
        read: vi.fn().mockResolvedValue(null), // read() returns null
      });
      const issue = createMockIssue({ worktreePath: "/path/to/worktree" });
      const engineer = new PromptEngineer(issue, mockMemory as any);

      const result = await engineer.buildHybridPrompt();

      // Should still work, using resume mode since L1 exists (but no memory content)
      expect(result.initialMessage).toContain("You are resuming work on issue");
    });

    it.fails("TODO: buildHybridPrompt should handle L2 search errors gracefully", async () => {
      // Currently L2 search errors propagate up. Future enhancement: catch
      // errors and continue building prompt without context.
      const mockMemory = createMockMemory();
      mockMemory.l2.search = vi.fn().mockRejectedValue(new Error("Search failed"));
      const issue = createMockIssue();
      const engineer = new PromptEngineer(issue, mockMemory as any);

      // Should not throw (but currently does)
      const result = await engineer.buildHybridPrompt();
      expect(result.systemPrompt).toContain("## Issue: AM-123");
    });

    it.fails("TODO: PromptEngineer should validate issue has required fields", () => {
      // Currently PromptEngineer doesn't validate that the issue has
      // required fields. Future enhancement: validate constructor args.
      const mockMemory = createMockMemory();
      const invalidIssue = {
        id: "test-uuid",
        // Missing externalId, source, title, etc.
      } as unknown as Issue;

      // This should throw a validation error
      expect(() => new PromptEngineer(invalidIssue, mockMemory as any)).toThrow();
    });
  });
});
