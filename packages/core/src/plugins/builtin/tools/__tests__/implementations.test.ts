import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolExecutionContext } from "#workflow";

import { memorySearchToolImpl } from "../implementations";

describe("memorySearchToolImpl", () => {
  let mockContext: ToolExecutionContext;
  let mockL2Search: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockL2Search = vi.fn();

    mockContext = {
      issueId: "TEST-123",
      worktreePath: "/tmp/test",
      db: {} as any,
      hooks: {} as any,
      memory: {
        l2: {
          search: mockL2Search,
        },
      } as any,
    };
  });

  describe("successful searches", () => {
    it("returns formatted results when documents found", async () => {
      mockL2Search.mockResolvedValue([
        {
          id: "doc-1",
          score: 0.95,
          content: "Authentication uses JWT tokens",
          metadata: { type: "decision", issueId: "AM-100", source: "session" },
        },
        {
          id: "doc-2",
          score: 0.82,
          content: "Password hashing with bcrypt",
          metadata: { type: "code_context" },
        },
      ]);

      const result = await memorySearchToolImpl(
        { query: "authentication" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Found 2 result(s)");
      expect(result.output).toContain("doc-1");
      expect(result.output).toContain("0.950");
      expect(result.output).toContain("decision");
      expect(result.output).toContain("AM-100");
      expect(result.output).toContain("session");
      expect(result.output).toContain("Authentication uses JWT tokens");
    });

    it("returns no results message when empty", async () => {
      mockL2Search.mockResolvedValue([]);

      const result = await memorySearchToolImpl(
        { query: "nonexistent" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("No matching documents found in memory.");
    });

    it("passes correct options to L2 search", async () => {
      mockL2Search.mockResolvedValue([]);

      await memorySearchToolImpl(
        {
          query: "test query",
          limit: 10,
          type: "decision",
          includeContent: false,
        },
        mockContext,
      );

      expect(mockL2Search).toHaveBeenCalledWith("test query", {
        limit: 10,
        filter: { type: "decision" },
        returnContent: false,
      });
    });

    it("uses default values when options not provided", async () => {
      mockL2Search.mockResolvedValue([]);

      await memorySearchToolImpl({ query: "test" }, mockContext);

      expect(mockL2Search).toHaveBeenCalledWith("test", {
        limit: 5,
        filter: undefined,
        returnContent: true,
      });
    });

    it("omits filter when type not provided", async () => {
      mockL2Search.mockResolvedValue([]);

      await memorySearchToolImpl({ query: "test", limit: 3 }, mockContext);

      expect(mockL2Search).toHaveBeenCalledWith("test", {
        limit: 3,
        filter: undefined,
        returnContent: true,
      });
    });
  });

  describe("result formatting", () => {
    it("formats results without content when not requested", async () => {
      mockL2Search.mockResolvedValue([
        {
          id: "doc-1",
          score: 0.75,
          metadata: { type: "session_memory" },
        },
      ]);

      const result = await memorySearchToolImpl(
        { query: "test", includeContent: false },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("doc-1");
      expect(result.output).toContain("0.750");
      expect(result.output).not.toContain("**Content:**");
    });

    it("formats results with partial metadata", async () => {
      mockL2Search.mockResolvedValue([
        {
          id: "doc-1",
          score: 0.5,
          content: "Some content",
          metadata: { type: "decision" }, // Only type, no issueId or source
        },
      ]);

      const result = await memorySearchToolImpl({ query: "test" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("**Type:** decision");
      expect(result.output).not.toContain("**Issue:**");
      expect(result.output).not.toContain("**Source:**");
    });

    it("handles results without metadata", async () => {
      mockL2Search.mockResolvedValue([
        {
          id: "doc-1",
          score: 0.6,
          content: "Content only",
        },
      ]);

      const result = await memorySearchToolImpl({ query: "test" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("doc-1");
      expect(result.output).toContain("Content only");
    });
  });

  describe("validation", () => {
    it("returns error for empty query", async () => {
      const result = await memorySearchToolImpl({ query: "" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Query is required and cannot be empty");
      expect(mockL2Search).not.toHaveBeenCalled();
    });

    it("returns error for whitespace-only query", async () => {
      const result = await memorySearchToolImpl({ query: "   " }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Query is required and cannot be empty");
      expect(mockL2Search).not.toHaveBeenCalled();
    });

    it("returns error for missing query", async () => {
      const result = await memorySearchToolImpl({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Query is required and cannot be empty");
    });
  });

  describe("error handling", () => {
    it("returns error when L2 search fails", async () => {
      mockL2Search.mockRejectedValue(new Error("Database connection failed"));

      const result = await memorySearchToolImpl({ query: "test" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database connection failed");
    });

    it("handles non-Error exceptions", async () => {
      mockL2Search.mockRejectedValue("String error");

      const result = await memorySearchToolImpl({ query: "test" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
    });
  });
});
