/**
 * Tests for Figma agent tools:
 *   figma_get_file, figma_get_comments, figma_post_comment
 */

import { describe, expect, it, vi } from "vitest";
import type { FigmaClient } from "../client.ts";
import { createFigmaTools } from "../tools/index.ts";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeDb(externalId: string, source = "figma") {
  return {
    issues: {
      getByExternalId: vi
        .fn()
        .mockImplementation((extId: string, src: string) =>
          extId === externalId && src === source ? { id: "uuid-1", externalId, source } : undefined,
        ),
    },
  };
}

function makeCtx(issueId: string, db: ReturnType<typeof makeDb>) {
  return {
    issueId,
    worktreePath: "/tmp/wh",
    db: db as any,
    hooks: { emit: vi.fn() } as any,
    memory: {} as any,
  };
}

const mockFile = {
  name: "My App",
  lastModified: "2024-06-01T10:00:00Z",
  version: "v1",
  thumbnailUrl: "",
  document: {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: [
      {
        id: "1:1",
        name: "Page 1",
        type: "PAGE",
        children: [{ id: "2:1", name: "Hero Frame", type: "FRAME", children: [] }],
      },
    ],
  },
  components: {
    "comp-1": { key: "k1", name: "Button", description: "Primary button" },
  },
  styles: {
    "style-1": { key: "s1", name: "Primary/500", description: "", styleType: "FILL" as const },
  },
};

const mockComments = [
  {
    id: "c1",
    message: "LGTM!",
    user: { id: "u1", handle: "alice", img_url: "" },
    created_at: "2024-01-01T10:00:00Z",
    resolved_at: null as null,
  },
  {
    id: "c2",
    message: "Can you check the spacing?",
    parent_id: "c1",
    user: { id: "u2", handle: "bob", img_url: "" },
    created_at: "2024-01-02T10:00:00Z",
    resolved_at: null as null,
  },
  {
    id: "c3",
    message: "Resolved issue",
    user: { id: "u1", handle: "alice", img_url: "" },
    created_at: "2024-01-03T10:00:00Z",
    resolved_at: "2024-01-04T10:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// createFigmaTools
// ---------------------------------------------------------------------------

describe("createFigmaTools", () => {
  it("returns exactly three tools", () => {
    const tools = createFigmaTools({} as FigmaClient);
    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain("figma_get_file");
    expect(names).toContain("figma_get_comments");
    expect(names).toContain("figma_post_comment");
  });
});

// ---------------------------------------------------------------------------
// figma_get_file
// ---------------------------------------------------------------------------

describe("figma_get_file", () => {
  function getTool(client: FigmaClient) {
    return createFigmaTools(client).find((t) => t.name === "figma_get_file")!;
  }

  it("returns structured file data on success", async () => {
    const mockClient = {
      fetchFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FigmaClient;
    const db = makeDb("abc123XYZ");
    const tool = getTool(mockClient);

    const result = await tool.execute({}, makeCtx("abc123XYZ", db));

    expect(result.success).toBe(true);
    const data = JSON.parse(result.output!);
    expect(data.name).toBe("My App");
    expect(data.version).toBe("v1");
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].name).toBe("Page 1");
    expect(data.pages[0].frames[0].name).toBe("Hero Frame");
    expect(data.components[0].name).toBe("Button");
    expect(data.styles[0].name).toBe("Primary/500");
  });

  it("uses the depth argument", async () => {
    const mockClient = {
      fetchFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);
    await tool.execute({ depth: 4 }, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    expect(mockClient.fetchFile).toHaveBeenCalledWith("abc123XYZ", 4);
  });

  it("defaults to depth=2 when not specified", async () => {
    const mockClient = {
      fetchFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);
    await tool.execute({}, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    expect(mockClient.fetchFile).toHaveBeenCalledWith("abc123XYZ", 2);
  });

  it("strips the nodeId portion from a composite externalId", async () => {
    const mockClient = {
      fetchFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FigmaClient;
    const db = makeDb("abc123#5:10");
    const tool = getTool(mockClient);

    await tool.execute({}, makeCtx("abc123#5:10", db));
    // fetchFile should be called with just the file key
    expect(mockClient.fetchFile).toHaveBeenCalledWith("abc123", 2);
  });

  it("returns error for non-Figma issue", async () => {
    const mockClient = { fetchFile: vi.fn() } as unknown as FigmaClient;
    const db = makeDb("AM-123", "jira");
    const tool = getTool(mockClient);

    const result = await tool.execute({}, makeCtx("AM-123", db));
    expect(result.success).toBe(false);
    expect(result.error).toContain("only works for Figma-sourced issues");
    expect(mockClient.fetchFile).not.toHaveBeenCalled();
  });

  it("returns error when client throws", async () => {
    const mockClient = {
      fetchFile: vi.fn().mockRejectedValue(new Error("Rate limited")),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute({}, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limited");
  });
});

// ---------------------------------------------------------------------------
// figma_get_comments
// ---------------------------------------------------------------------------

describe("figma_get_comments", () => {
  function getTool(client: FigmaClient) {
    return createFigmaTools(client).find((t) => t.name === "figma_get_comments")!;
  }

  it("returns only open comments by default", async () => {
    const mockClient = {
      fetchComments: vi.fn().mockResolvedValue(mockComments),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute({}, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    expect(result.success).toBe(true);
    // c3 is resolved — should be excluded by default
    expect(result.output).not.toContain("Resolved issue");
    expect(result.output).toContain("LGTM!");
  });

  it("includes resolved comments when includeResolved=true", async () => {
    const mockClient = {
      fetchComments: vi.fn().mockResolvedValue(mockComments),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute(
      { includeResolved: true },
      makeCtx("abc123XYZ", makeDb("abc123XYZ")),
    );
    expect(result.output).toContain("Resolved issue");
  });

  it("groups replies under their parent thread", async () => {
    const mockClient = {
      fetchComments: vi.fn().mockResolvedValue(mockComments),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute({}, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    // bob's reply should appear after alice's root comment
    expect(result.output).toContain("alice");
    expect(result.output).toContain("bob");
    const alicePos = result.output!.indexOf("alice");
    const bobPos = result.output!.indexOf("bob");
    expect(alicePos).toBeLessThan(bobPos);
  });

  it("returns a friendly message when there are no open comments", async () => {
    const mockClient = {
      fetchComments: vi.fn().mockResolvedValue([]),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute({}, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/no (open )?comments/i);
  });

  it("returns error for non-Figma issue", async () => {
    const db = makeDb("AM-123", "jira");
    const mockClient = { fetchComments: vi.fn() } as unknown as FigmaClient;
    const result = await getTool(mockClient).execute({}, makeCtx("AM-123", db));
    expect(result.success).toBe(false);
    expect(mockClient.fetchComments).not.toHaveBeenCalled();
  });

  it("returns error when client throws", async () => {
    const mockClient = {
      fetchComments: vi.fn().mockRejectedValue(new Error("API error")),
    } as unknown as FigmaClient;
    const result = await getTool(mockClient).execute({}, makeCtx("abc123XYZ", makeDb("abc123XYZ")));
    expect(result.success).toBe(false);
    expect(result.error).toBe("API error");
  });
});

// ---------------------------------------------------------------------------
// figma_post_comment
// ---------------------------------------------------------------------------

describe("figma_post_comment", () => {
  function getTool(client: FigmaClient) {
    return createFigmaTools(client).find((t) => t.name === "figma_post_comment")!;
  }

  it("posts a top-level comment and returns success", async () => {
    const posted = {
      id: "c99",
      message: "Looks good!",
      user: { id: "u1", handle: "agent", img_url: "" },
      created_at: "2024-01-10",
      resolved_at: null,
    };
    const mockClient = {
      postComment: vi.fn().mockResolvedValue(posted),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute(
      { message: "Looks good!" },
      makeCtx("abc123XYZ", makeDb("abc123XYZ")),
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("c99");
    // Workhorse footer is appended to the message
    expect(mockClient.postComment).toHaveBeenCalledWith(
      "abc123XYZ",
      expect.stringMatching(/Looks good![\s\S]*Workhorse agent/),
      undefined,
    );
  });

  it("passes replyToId to the client when replying", async () => {
    const mockClient = {
      postComment: vi.fn().mockResolvedValue({
        id: "c100",
        message: "Reply",
        user: { id: "u1", handle: "agent", img_url: "" },
        created_at: "2024-01-11",
        resolved_at: null,
      }),
    } as unknown as FigmaClient;
    const tool = getTool(mockClient);

    const result = await tool.execute(
      { message: "Thanks!", replyToId: "c1" },
      makeCtx("abc123XYZ", makeDb("abc123XYZ")),
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("c1");
    expect(mockClient.postComment).toHaveBeenCalledWith("abc123XYZ", expect.any(String), "c1");
  });

  it("returns error when message is empty", async () => {
    const mockClient = { postComment: vi.fn() } as unknown as FigmaClient;
    const result = await getTool(mockClient).execute(
      { message: "   " },
      makeCtx("abc123XYZ", makeDb("abc123XYZ")),
    );
    expect(result.success).toBe(false);
    expect(mockClient.postComment).not.toHaveBeenCalled();
  });

  it("returns error for non-Figma issue", async () => {
    const db = makeDb("PROJ-1", "jira");
    const mockClient = { postComment: vi.fn() } as unknown as FigmaClient;
    const result = await getTool(mockClient).execute({ message: "Hello" }, makeCtx("PROJ-1", db));
    expect(result.success).toBe(false);
    expect(mockClient.postComment).not.toHaveBeenCalled();
  });

  it("returns error when client throws", async () => {
    const mockClient = {
      postComment: vi.fn().mockRejectedValue(new Error("Rate limited")),
    } as unknown as FigmaClient;
    const result = await getTool(mockClient).execute(
      { message: "Hello!" },
      makeCtx("abc123XYZ", makeDb("abc123XYZ")),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limited");
  });
});
