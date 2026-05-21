import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkhorseConfig } from "#config";
import { Database } from "#db";
import { hooks } from "#lib";
import type { MemoryService } from "#services";
import type { IssueParserOptions, ParsedIssue } from "#workflow";
import { Tracker } from "#workflow";

// Mock MemoryService
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

const mockConfig: WorkhorseConfig = {
  agent: { harness: "claude-code" as const },
  behavior: { autoResume: true, pollInterval: 30000 },
  prompt: { custom: undefined },
  ui: { theme: "default" },
  plugins: { disabled: [] },
  steering: { enabled: false, debounceMs: 500, maxReminders: 3, cooldownMs: 60000 },
};

function createParserOptions(overrides: Partial<IssueParserOptions> = {}): IssueParserOptions {
  return {
    source: overrides.source ?? "test-source",
    canParse: overrides.canParse ?? ((input) => /^[A-Z]+-\d+$/.test(input)),
    parse: overrides.parse ?? vi.fn(),
  };
}

const testIssue = (externalId: string, overrides: Record<string, unknown> = {}) => ({
  externalId,
  source: "test-source",
  title: `Issue ${externalId}`,
  description: "",
  status: "pending" as const,
  issueType: "task" as const,
  url: null,
  assignee: null,
  labels: null,
  metadata: {},
  worktreePath: null,
  ...overrides,
});

describe("Tracker", () => {
  let db: Database;
  let tracker: Tracker;
  let mockMemory: ReturnType<typeof createMockMemory>;

  beforeEach(async () => {
    hooks.all.clear();
    db = await Database.create(":memory:");
    mockMemory = createMockMemory();
    tracker = new Tracker(db, hooks, mockMemory as unknown as MemoryService, mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  describe("registerParser", () => {
    it("registers a parser", () => {
      tracker.registerParser(createParserOptions({}));
      expect(tracker.getParsers()).toHaveLength(1);
    });

    it("allows multiple parsers", () => {
      tracker.registerParser(createParserOptions({ source: "source-a" }));
      tracker.registerParser(
        createParserOptions({
          source: "source-b",
          canParse: (input) => input.includes("#"),
        }),
      );

      expect(tracker.getParsers()).toHaveLength(2);
    });
  });

  describe("parseInput", () => {
    it("throws if no parser matches", async () => {
      await expect(tracker.parseInput("unknown-input")).rejects.toThrow(
        'No parser found for input: "unknown-input"',
      );
    });

    it("uses the first matching parser", async () => {
      const parsed: ParsedIssue = {
        externalId: "AM-123",
        source: "test-source",
        title: "Test Issue",
        description: "A test issue",
        issueType: "task",
        metadata: {},
      };

      const parseFn = vi.fn().mockResolvedValue(parsed);
      tracker.registerParser(createParserOptions({ parse: parseFn }));
      const issue = await tracker.parseInput("AM-123");

      expect(parseFn).toHaveBeenCalledWith("AM-123");
      expect(issue.externalId).toBe("AM-123");
      expect(issue.source).toBe("test-source");
      expect(issue.title).toBe("Test Issue");
    });

    it("trims input before parsing", async () => {
      const parsed: ParsedIssue = {
        externalId: "AM-123",
        source: "test-source",
        title: "Test Issue",
        description: "",
        issueType: "task",
        metadata: {},
      };

      const parseFn = vi.fn().mockResolvedValue(parsed);
      tracker.registerParser(createParserOptions({ parse: parseFn }));
      await tracker.parseInput("  AM-123  ");

      expect(parseFn).toHaveBeenCalledWith("AM-123");
    });

    it("returns existing issue if already in database", async () => {
      const parsed: ParsedIssue = {
        externalId: "AM-123",
        source: "test-source",
        title: "Test Issue",
        description: "A test issue",
        issueType: "task",
        metadata: {},
      };

      const parseFn = vi.fn().mockResolvedValue(parsed);
      tracker.registerParser(
        createParserOptions({
          canParse: () => true,
          parse: parseFn,
        }),
      );

      // First call creates the issue
      const first = await tracker.parseInput("AM-123");
      // Second call should return existing
      const second = await tracker.parseInput("AM-123");

      expect(first.id).toBe(second.id);
      expect(parseFn).toHaveBeenCalledTimes(2); // parse is still called
    });

    it("emits issue.parsed hook", async () => {
      const parsed: ParsedIssue = {
        externalId: "AM-123",
        source: "test-source",
        title: "Test Issue",
        description: "",
        issueType: "task",
        metadata: { key: "value" },
      };

      tracker.registerParser(
        createParserOptions({
          canParse: () => true,
          parse: vi.fn().mockResolvedValue(parsed),
        }),
      );

      const hookHandler = vi.fn();
      hooks.on("issue.parsed", hookHandler);

      await tracker.parseInput("AM-123");

      expect(hookHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          issue: expect.objectContaining({
            externalId: "AM-123",
            source: "test-source",
          }),
          raw: parsed,
        }),
      );
    });

    it("inserts issue with correct fields", async () => {
      const parsed: ParsedIssue = {
        externalId: "AM-456",
        source: "test-source",
        title: "My Title",
        description: "My Description",
        issueType: "bug",
        url: "https://jira.example.com/AM-456",
        assignee: "john.doe",
        labels: ["urgent", "frontend"],
        metadata: { priority: "high" },
      };

      tracker.registerParser(
        createParserOptions({
          canParse: () => true,
          parse: vi.fn().mockResolvedValue(parsed),
        }),
      );
      const issue = await tracker.parseInput("AM-456");

      expect(issue.externalId).toBe("AM-456");
      expect(issue.source).toBe("test-source");
      expect(issue.title).toBe("My Title");
      expect(issue.description).toBe("My Description");
      expect(issue.issueType).toBe("bug");
      expect(issue.url).toBe("https://jira.example.com/AM-456");
      expect(issue.assignee).toBe("john.doe");
      expect(issue.labels).toEqual(["urgent", "frontend"]);
      expect(issue.metadata).toEqual({ priority: "high" });
      expect(issue.status).toBe("pending");
    });

    it("handles optional fields as null", async () => {
      const parsed: ParsedIssue = {
        externalId: "AM-789",
        source: "test-source",
        title: "Minimal Issue",
        description: "",
        issueType: "task",
        metadata: {},
      };

      tracker.registerParser(
        createParserOptions({
          canParse: () => true,
          parse: vi.fn().mockResolvedValue(parsed),
        }),
      );
      const issue = await tracker.parseInput("AM-789");

      expect(issue.url).toBeNull();
      expect(issue.assignee).toBeNull();
      expect(issue.labels).toBeNull();
    });
  });

  describe("buildPrompt", () => {
    it("throws if issue not found", async () => {
      await expect(tracker.buildPrompt("nonexistent-id")).rejects.toThrow(
        "Issue not found: nonexistent-id",
      );
    });

    it("throws if no parser for source", async () => {
      const issue = await db.issues.insert(testIssue("AM-100", { source: "unknown-source" }));
      await expect(tracker.buildPrompt(issue.id)).rejects.toThrow(
        'No parser found for source: "unknown-source"',
      );
    });

    it("builds prompt for existing issue", async () => {
      tracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(
        testIssue("AM-100", { title: "Build Test Issue", description: "Testing prompt building" }),
      );
      const prompt = await tracker.buildPrompt(issue.id);
      expect(prompt).toContain("AM-100");
      expect(prompt).toContain("Build Test Issue");
      expect(prompt).toContain("Testing prompt building");
    });

    it("emits prompt.built hook", async () => {
      tracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(testIssue("AM-101", { title: "Hook Test" }));
      const builtHandler = vi.fn();
      hooks.on("prompt.built", builtHandler);
      await tracker.buildPrompt(issue.id);
      expect(builtHandler).toHaveBeenCalledWith(
        expect.objectContaining({ issueId: issue.id, prompt: expect.any(String) }),
      );
    });

    it("includes notifications as context block", async () => {
      const customMemory = {
        ...mockMemory,
        notifications: {
          getUnread: vi.fn().mockReturnValue([{ id: "notif-1", title: "Test notification" }]),
          generateInbox: vi.fn().mockReturnValue("<system_inbox>Test</system_inbox>"),
        },
      };
      const customTracker = new Tracker(
        db,
        hooks,
        customMemory as unknown as MemoryService,
        mockConfig,
      );
      customTracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(testIssue("AM-102", { title: "Notification Test" }));
      const prompt = await customTracker.buildPrompt(issue.id);
      expect(prompt).toContain("Pending Notifications");
      expect(customMemory.notifications.generateInbox).toHaveBeenCalled();
    });

    it("queries L2 memory for context", async () => {
      const customMemory = {
        ...mockMemory,
        l2: {
          search: vi
            .fn()
            .mockResolvedValue([
              { id: "doc-1", score: 0.85, content: "Related doc", metadata: { type: "decision" } },
            ]),
        },
      };
      const customTracker = new Tracker(
        db,
        hooks,
        customMemory as unknown as MemoryService,
        mockConfig,
      );
      customTracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(
        testIssue("AM-103", { title: "L2 Search Test", description: "Find related context" }),
      );
      const prompt = await customTracker.buildPrompt(issue.id);
      expect(customMemory.l2.search).toHaveBeenCalledWith(
        "L2 Search Test Find related context",
        expect.objectContaining({ limit: 5, returnContent: true }),
      );
      expect(prompt).toContain("Related Context");
      expect(prompt).toContain("Related doc");
    });

    it("includes custom instructions from config", async () => {
      const customConfig: WorkhorseConfig = { ...mockConfig, prompt: { custom: "Best practices" } };
      const customTracker = new Tracker(
        db,
        hooks,
        mockMemory as unknown as MemoryService,
        customConfig,
      );
      customTracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(testIssue("AM-104", { title: "Custom Instructions" }));
      const prompt = await customTracker.buildPrompt(issue.id);
      expect(prompt).toContain("Custom Instructions");
      expect(prompt).toContain("Best practices");
    });

    it.fails("TODO: buildPrompt should handle L2 search errors gracefully", async () => {
      const customMemory = {
        ...mockMemory,
        l2: { search: vi.fn().mockRejectedValue(new Error()) },
      };
      const customTracker = new Tracker(
        db,
        hooks,
        customMemory as unknown as MemoryService,
        mockConfig,
      );
      customTracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(testIssue("AM-105", { title: "Error Handling Test" }));
      const prompt = await customTracker.buildPrompt(issue.id);
      expect(prompt).toContain("AM-105");
    });

    it.fails("TODO: buildPrompt should validate issue data before building", async () => {
      tracker.registerParser(createParserOptions());
      const issue = await db.issues.insert(testIssue("AM-999", { title: "" }));
      await expect(tracker.buildPrompt(issue.id)).rejects.toThrow();
    });
  });
});
