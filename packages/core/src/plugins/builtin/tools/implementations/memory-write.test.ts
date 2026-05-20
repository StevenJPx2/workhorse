import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolExecutionContext } from "#workflow/orchestrator";

import { memoryWriteToolImpl } from "./memory-write.ts";

describe("memoryWriteToolImpl", () => {
  let mockContext: ToolExecutionContext;
  let mockRead: ReturnType<typeof vi.fn>;
  let mockAppendSession: ReturnType<typeof vi.fn>;
  let mockUpdatePatterns: ReturnType<typeof vi.fn>;
  let mockL1Exists: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRead = vi.fn();
    mockAppendSession = vi.fn().mockResolvedValue(undefined);
    mockUpdatePatterns = vi.fn().mockResolvedValue(undefined);
    mockL1Exists = vi.fn().mockReturnValue(true);

    mockContext = {
      issueId: "TEST-123",
      worktreePath: "/tmp/test",
      db: {} as any,
      hooks: {} as any,
      memory: {
        l1: {
          get: vi.fn().mockReturnValue({
            exists: mockL1Exists,
            read: mockRead,
            appendSession: mockAppendSession,
            updatePatterns: mockUpdatePatterns,
          }),
        },
      } as any,
    };
  });

  describe("writing session entries", () => {
    it("appends a session entry when summary provided", async () => {
      mockRead.mockResolvedValue({ latestStatus: "implementing" });

      const result = await memoryWriteToolImpl(
        { summary: ["Added auth middleware", "Updated tests"] },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(mockAppendSession).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: ["Added auth middleware", "Updated tests"],
          learnings: [],
          filesChanged: [],
          status: "implementing",
        }),
      );
    });

    it("appends with learnings and filesChanged", async () => {
      mockRead.mockResolvedValue({ latestStatus: "implementing" });

      await memoryWriteToolImpl(
        {
          summary: ["Refactored DB layer"],
          learnings: ["Drizzle requires explicit transaction handling"],
          filesChanged: ["src/db/index.ts", "src/db/schema.ts"],
        },
        mockContext,
      );

      expect(mockAppendSession).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: ["Refactored DB layer"],
          learnings: ["Drizzle requires explicit transaction handling"],
          filesChanged: ["src/db/index.ts", "src/db/schema.ts"],
        }),
      );
    });

    it("uses 'Session checkpoint' when no summary items given but other data present", async () => {
      mockRead.mockResolvedValue({ latestStatus: "planning" });

      await memoryWriteToolImpl({ learnings: ["Learned something"] }, mockContext);

      expect(mockAppendSession).toHaveBeenCalledWith(
        expect.objectContaining({ summary: ["Session checkpoint"] }),
      );
    });
  });

  describe("writing patterns", () => {
    it("updates patterns when provided", async () => {
      await memoryWriteToolImpl(
        { patterns: ["Uses Zod for validation", "All routes typed"] },
        mockContext,
      );

      expect(mockUpdatePatterns).toHaveBeenCalledWith([
        "Uses Zod for validation",
        "All routes typed",
      ]);
    });

    it("does not call updatePatterns when patterns not provided", async () => {
      mockRead.mockResolvedValue({ latestStatus: "implementing" });

      await memoryWriteToolImpl({ summary: ["Did some work"] }, mockContext);

      expect(mockUpdatePatterns).not.toHaveBeenCalled();
    });

    it("allows updating patterns alone without a session entry", async () => {
      const result = await memoryWriteToolImpl({ patterns: ["Pattern A"] }, mockContext);

      expect(result.success).toBe(true);
      expect(mockAppendSession).not.toHaveBeenCalled();
      expect(mockUpdatePatterns).toHaveBeenCalledWith(["Pattern A"]);
    });
  });

  describe("combined writes", () => {
    it("writes both session entry and patterns together", async () => {
      mockRead.mockResolvedValue({ latestStatus: "implementing" });

      const result = await memoryWriteToolImpl(
        {
          summary: ["Implemented feature"],
          patterns: ["Uses factory pattern"],
          learnings: ["Factory avoids circular deps"],
          filesChanged: ["src/factory.ts"],
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(mockAppendSession).toHaveBeenCalled();
      expect(mockUpdatePatterns).toHaveBeenCalledWith(["Uses factory pattern"]);
      expect(result.output).toContain("session entry");
      expect(result.output).toContain("1 patterns");
    });
  });

  describe("error handling", () => {
    it("returns error when L1 context not found", async () => {
      (mockContext.memory.l1.get as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await memoryWriteToolImpl({ summary: ["Did work"] }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No session memory found");
    });

    it("returns error when L1 context does not exist on disk", async () => {
      mockL1Exists.mockReturnValue(false);

      const result = await memoryWriteToolImpl({ summary: ["Did work"] }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No session memory found");
    });

    it("returns error when read fails", async () => {
      mockRead.mockResolvedValue(null);

      const result = await memoryWriteToolImpl({ summary: ["Did work"] }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to read session memory");
    });

    it("returns error when appendSession throws", async () => {
      mockRead.mockResolvedValue({ latestStatus: "implementing" });
      mockAppendSession.mockRejectedValue(new Error("Write failed"));

      const result = await memoryWriteToolImpl({ summary: ["Did work"] }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Write failed");
    });

    it("succeeds with empty args (no-op)", async () => {
      const result = await memoryWriteToolImpl({}, mockContext);

      expect(result.success).toBe(true);
      expect(mockAppendSession).not.toHaveBeenCalled();
      expect(mockUpdatePatterns).not.toHaveBeenCalled();
    });
  });
});
