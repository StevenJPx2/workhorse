/**
 * Tests for Playwright cross-plugin sync with GitHub
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test directory for attachments
const testDir = join(tmpdir(), "wh-cross-plugin-test");

// Types for test mocking
interface PRContribution {
  section: string;
  content: string;
  priority?: number;
}

interface PROpeningEvent {
  issueId: string;
  title?: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  worktreePath?: string;
  contributions: PRContribution[];
}

type HookHandler = (event: unknown) => Promise<void>;

describe("registerPlaywrightCrossPluginSync", () => {
  // Track registered hooks
  const hookHandlers: Map<string, HookHandler[]> = new Map();

  // Mock context
  const createMockContext = () => ({
    hooks: {
      on: vi.fn((event: string, handler: (event: unknown) => Promise<void>) => {
        const handlers = hookHandlers.get(event) ?? [];
        handlers.push(handler);
        hookHandlers.set(event, handlers);
      }),
      emit: vi.fn(),
    },
    db: {
      issues: {
        getByExternalId: vi.fn(),
      },
    },
  });

  // Mock attachment service
  const createMockAttachmentService = () => ({
    store: vi.fn(),
    exists: vi.fn(),
    listForIssue: vi.fn(),
    delete: vi.fn(),
    getIssueDir: vi.fn(),
  });

  // Mock session manager
  const mockSessionManager = {
    getSessionState: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hookHandlers.clear();
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("registers github:pr.opening hook handler", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    expect(ctx.hooks.on).toHaveBeenCalledWith("github:pr.opening", expect.any(Function));
  });

  it("adds screenshots section when screenshots exist", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    // Mock issue lookup
    ctx.db.issues.getByExternalId.mockResolvedValue({
      id: "uuid-123",
      externalId: "TEST-123",
      repository: "org/repo",
    });

    // Mock attachment listing with screenshots
    attachmentService.listForIssue.mockResolvedValue([
      {
        sourceId: "screenshot-1234567890",
        source: "unknown",
        filename: "screenshot-1234567890_homepage.png",
        mimeType: "image/png",
        size: 102400,
        localPath:
          "/home/user/.local/share/workhorse/attachments/org-repo/TEST-123/screenshot-1234567890_homepage.png",
        downloadedAt: "2024-01-15T10:00:00Z",
      },
      {
        sourceId: "screenshot-1234567891",
        source: "unknown",
        filename: "screenshot-1234567891_form.jpeg",
        mimeType: "image/jpeg",
        size: 51200,
        localPath:
          "/home/user/.local/share/workhorse/attachments/org-repo/TEST-123/screenshot-1234567891_form.jpeg",
        downloadedAt: "2024-01-15T10:01:00Z",
      },
    ]);

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    // Simulate PR opening event
    const prOpeningEvent: PROpeningEvent = {
      issueId: "TEST-123",
      title: "Fix homepage",
      body: "This fixes the homepage",
      base: "main",
      head: "fix/homepage",
      draft: false,
      worktreePath: testDir,
      contributions: [],
    };

    const handlers = hookHandlers.get("github:pr.opening") ?? [];
    expect(handlers.length).toBe(1);

    await handlers[0]!(prOpeningEvent);

    // Should have added a contribution
    expect(prOpeningEvent.contributions.length).toBe(1);
    const contribution = prOpeningEvent.contributions[0]!;
    expect(contribution.section).toBe("Screenshots");
    expect(contribution.priority).toBe(80);
    expect(contribution.content).toContain("2 screenshots captured");
    expect(contribution.content).toContain("homepage.png");
    expect(contribution.content).toContain("form.jpeg");
    expect(contribution.content).toContain("100.0 KB");
    expect(contribution.content).toContain("50.0 KB");
  });

  it("does not add section when no screenshots exist", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    ctx.db.issues.getByExternalId.mockResolvedValue({
      id: "uuid-123",
      externalId: "TEST-123",
      repository: "org/repo",
    });

    // No screenshots
    attachmentService.listForIssue.mockResolvedValue([]);

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    const prOpeningEvent = {
      issueId: "TEST-123",
      title: "Fix homepage",
      body: "",
      base: "main",
      head: "fix/homepage",
      draft: false,
      worktreePath: testDir,
      contributions: [],
    };

    const handlers = hookHandlers.get("github:pr.opening") ?? [];
    await handlers[0]!(prOpeningEvent);

    // Should NOT have added any contribution
    expect(prOpeningEvent.contributions.length).toBe(0);
  });

  it("filters out non-screenshot attachments", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    ctx.db.issues.getByExternalId.mockResolvedValue({
      id: "uuid-123",
      externalId: "TEST-123",
      repository: "org/repo",
    });

    // Mix of screenshots and other attachments
    attachmentService.listForIssue.mockResolvedValue([
      {
        sourceId: "screenshot-1234567890",
        filename: "screenshot-1234567890_test.png",
        size: 1024,
        localPath: "/path/to/screenshot.png",
      },
      {
        sourceId: "some-attachment",
        filename: "document.pdf",
        size: 2048,
        localPath: "/path/to/document.pdf",
      },
      {
        sourceId: "jira-image",
        filename: "jira-image_diagram.png",
        size: 3072,
        localPath: "/path/to/diagram.png",
      },
    ]);

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    const prOpeningEvent: PROpeningEvent = {
      issueId: "TEST-123",
      contributions: [],
    };

    const handlers = hookHandlers.get("github:pr.opening") ?? [];
    await handlers[0]!(prOpeningEvent);

    // Should only include the screenshot (not PDF or jira-image)
    expect(prOpeningEvent.contributions.length).toBe(1);
    expect(prOpeningEvent.contributions[0]!.content).toContain("1 screenshot captured");
    expect(prOpeningEvent.contributions[0]!.content).toContain("test.png");
    expect(prOpeningEvent.contributions[0]!.content).not.toContain("document.pdf");
    expect(prOpeningEvent.contributions[0]!.content).not.toContain("diagram.png");
  });

  it("handles issue not found gracefully", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    // Issue not found
    ctx.db.issues.getByExternalId.mockResolvedValue(null);

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    const prOpeningEvent = {
      issueId: "UNKNOWN-999",
      contributions: [],
    };

    const handlers = hookHandlers.get("github:pr.opening") ?? [];
    await handlers[0]!(prOpeningEvent);

    // Should not have added anything and not throw
    expect(prOpeningEvent.contributions.length).toBe(0);
    expect(attachmentService.listForIssue).not.toHaveBeenCalled();
  });

  it("handles attachment service errors gracefully", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    ctx.db.issues.getByExternalId.mockResolvedValue({
      id: "uuid-123",
      externalId: "TEST-123",
      repository: "org/repo",
    });

    // Simulate error
    attachmentService.listForIssue.mockRejectedValue(new Error("Disk error"));

    // Capture console.error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    const prOpeningEvent: PROpeningEvent = {
      issueId: "TEST-123",
      contributions: [],
    };

    const handlers = hookHandlers.get("github:pr.opening") ?? [];
    await handlers[0]!(prOpeningEvent);

    // Should not throw and should log error
    expect(prOpeningEvent.contributions.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[playwright] Failed to add Screenshots to PR:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("uses singular 'screenshot' for single screenshot", async () => {
    const { registerPlaywrightCrossPluginSync } = await import("../cross-plugin-sync.ts");

    const ctx = createMockContext();
    const attachmentService = createMockAttachmentService();

    ctx.db.issues.getByExternalId.mockResolvedValue({
      id: "uuid-123",
      externalId: "TEST-123",
      repository: "org/repo",
    });

    attachmentService.listForIssue.mockResolvedValue([
      {
        sourceId: "screenshot-1234567890",
        filename: "screenshot-1234567890_single.png",
        size: 1024,
        localPath: "/path/to/single.png",
      },
    ]);

    registerPlaywrightCrossPluginSync(
      ctx as never,
      mockSessionManager as never,
      attachmentService as never,
    );

    const prOpeningEvent: PROpeningEvent = {
      issueId: "TEST-123",
      contributions: [],
    };

    const handlers = hookHandlers.get("github:pr.opening") ?? [];
    await handlers[0]!(prOpeningEvent);

    expect(prOpeningEvent.contributions[0]!.content).toContain("1 screenshot captured");
    expect(prOpeningEvent.contributions[0]!.content).not.toContain("screenshots");
  });
});
