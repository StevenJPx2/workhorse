/**
 * Tests for cross-plugin integration (Figma link discovery from Jira/other sources).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HookEmitter } from "workhorse-core";

import type { FigmaClient } from "../client.ts";
import {
  registerCrossPluginHandlers,
  buildLinkedDesignContextBlocks,
  getLinkedDesigns,
  clearLinkedDesigns,
} from "../cross-plugin.ts";

// Mock FigmaClient
function createMockClient(overrides: Partial<FigmaClient> = {}): FigmaClient {
  return {
    fetchFile: vi.fn().mockResolvedValue({
      name: "Test Design",
      lastModified: "2024-01-15T10:00:00Z",
      version: "123456",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          { id: "1:0", name: "Page 1", type: "CANVAS" },
          { id: "2:0", name: "Page 2", type: "CANVAS" },
        ],
      },
      components: {
        "3:0": { name: "Button", description: "Primary button" },
        "3:1": { name: "Input", description: "Text input field" },
      },
      styles: {},
    }),
    fetchNode: vi.fn(),
    fetchComments: vi.fn(),
    postComment: vi.fn(),
    fetchFileVersion: vi.fn(),
    ...overrides,
  } as unknown as FigmaClient;
}

type HandlerFn = (payload: any) => void | Promise<void>;

// Mock HookEmitter
function createMockHooks(): HookEmitter & {
  handlers: Map<string, HandlerFn[]>;
} {
  const handlers = new Map<string, HandlerFn[]>();

  return {
    handlers,
    on: vi.fn((name: string, handler: HandlerFn) => {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name)!.push(handler);
      return () => {
        const arr = handlers.get(name);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    }),
    emit: vi.fn(),
    callHook: vi.fn(),
    off: vi.fn(),
    all: { clear: vi.fn() },
  };
}

/** Get the registered handler for a hook name */
function getHandler(
  hooks: ReturnType<typeof createMockHooks>,
  name: string,
): HandlerFn {
  const arr = hooks.handlers.get(name);
  if (!arr || arr.length === 0) throw new Error(`No handler for ${name}`);
  return arr[0]!;
}

describe("cross-plugin", () => {
  beforeEach(() => {
    // Clear any cached linked designs
    clearLinkedDesigns("AM-123");
    clearLinkedDesigns("AM-456");
  });

  describe("registerCrossPluginHandlers", () => {
    it("registers handler for issue.links.discovered", () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      expect(hooks.on).toHaveBeenCalledWith(
        "issue.links.discovered",
        expect.any(Function),
      );
    });

    it("returns unsubscribe function", () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      const unsubscribe = registerCrossPluginHandlers(hooks, client);

      expect(typeof unsubscribe).toBe("function");
    });

    it("fetches Figma file when Figma URL is discovered", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      // Simulate issue.links.discovered event with a Figma URL
      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Design mockup",
            href: "https://www.figma.com/file/abc123/My-Design",
            source: "description",
          },
        ],
      });

      expect(client.fetchFile).toHaveBeenCalledWith("abc123", 1);
    });

    it("ignores non-Figma URLs", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Google",
            href: "https://google.com",
            source: "description",
          },
          {
            text: "GitHub",
            href: "https://github.com/org/repo",
            source: "comment",
          },
        ],
      });

      expect(client.fetchFile).not.toHaveBeenCalled();
    });

    it("caches linked design context", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Design",
            href: "https://www.figma.com/file/abc123/My-Design",
            source: "description",
          },
        ],
      });

      const cached = getLinkedDesigns("AM-123");
      expect(cached).toHaveLength(1);
      expect(cached[0]).toMatchObject({
        url: "https://www.figma.com/file/abc123/My-Design",
        name: "Test Design",
        pages: ["Page 1", "Page 2"],
        components: ["Button", "Input"],
        source: "description",
      });
    });

    it("handles multiple Figma URLs in same issue", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-456", source: "jira" },
        links: [
          {
            text: "Design v1",
            href: "https://www.figma.com/file/abc123/Design-V1",
            source: "description",
          },
          {
            text: "Design v2",
            href: "https://www.figma.com/design/def456/Design-V2",
            source: "comment",
          },
        ],
      });

      expect(client.fetchFile).toHaveBeenCalledTimes(2);
      const cached = getLinkedDesigns("AM-456");
      expect(cached).toHaveLength(2);
    });

    it("handles API errors gracefully", async () => {
      const hooks = createMockHooks();
      const client = createMockClient({
        fetchFile: vi.fn().mockRejectedValue(new Error("API error")),
      });

      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");

      // Should not throw
      await expect(
        handler({
          issue: { externalId: "AM-123", source: "jira" },
          links: [
            {
              text: "Design",
              href: "https://www.figma.com/file/abc123/My-Design",
              source: "description",
            },
          ],
        }),
      ).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("extracts node-id from URL", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Specific frame",
            href: "https://www.figma.com/file/abc123/My-Design?node-id=5-10",
            source: "description",
          },
        ],
      });

      const cached = getLinkedDesigns("AM-123");
      expect(cached[0]!.ref.nodeId).toBe("5:10"); // Normalized hyphen to colon
    });
  });

  describe("buildLinkedDesignContextBlocks", () => {
    it("returns empty array for unknown issue", () => {
      const blocks = buildLinkedDesignContextBlocks("unknown-issue");
      expect(blocks).toEqual([]);
    });

    it("builds context blocks from cached designs", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Design",
            href: "https://www.figma.com/file/abc123/My-Design",
            source: "description",
          },
        ],
      });

      const blocks = buildLinkedDesignContextBlocks("AM-123");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]!).toMatchObject({
        id: "figma-linked-abc123",
        title: "Linked Figma Design",
        priority: 25,
      });
      expect(blocks[0]!.content).toContain("Test Design");
      expect(blocks[0]!.content).toContain("Page 1, Page 2");
      expect(blocks[0]!.content).toContain("Button, Input");
    });

    it("includes node-id in context when present", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Frame",
            href: "https://www.figma.com/file/abc123/My-Design?node-id=5-10",
            source: "description",
          },
        ],
      });

      const blocks = buildLinkedDesignContextBlocks("AM-123");
      expect(blocks[0]!.content).toContain("Linked node: 5:10");
    });

    it("truncates long component lists", async () => {
      const hooks = createMockHooks();
      const manyComponents: Record<
        string,
        { name: string; description: string }
      > = {};
      for (let i = 0; i < 20; i++) {
        manyComponents[`c:${i}`] = { name: `Component${i}`, description: "" };
      }

      const client = createMockClient({
        fetchFile: vi.fn().mockResolvedValue({
          name: "Big Design",
          lastModified: "2024-01-15T10:00:00Z",
          version: "123",
          document: { id: "0:0", name: "Doc", type: "DOCUMENT", children: [] },
          components: manyComponents,
          styles: {},
        }),
      });

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Design",
            href: "https://www.figma.com/file/abc123/Big-Design",
            source: "description",
          },
        ],
      });

      const blocks = buildLinkedDesignContextBlocks("AM-123");
      expect(blocks[0]!.content).toContain("(+10 more)");
    });
  });

  describe("clearLinkedDesigns", () => {
    it("clears cached design context", async () => {
      const hooks = createMockHooks();
      const client = createMockClient();

      registerCrossPluginHandlers(hooks, client);

      const handler = getHandler(hooks, "issue.links.discovered");
      await handler({
        issue: { externalId: "AM-123", source: "jira" },
        links: [
          {
            text: "Design",
            href: "https://www.figma.com/file/abc123/My-Design",
            source: "description",
          },
        ],
      });

      expect(getLinkedDesigns("AM-123")).toHaveLength(1);

      clearLinkedDesigns("AM-123");

      expect(getLinkedDesigns("AM-123")).toEqual([]);
    });
  });
});
