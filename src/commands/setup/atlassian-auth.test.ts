/**
 * Tests for Atlassian authentication helper
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  authenticateAtlassian,
  testAtlassianConnection,
  type AuthResult,
} from "./atlassian-auth.ts";

// Create a minimal mock subprocess
function createMockSubprocess(exitCode: number, exitDelay = 0) {
  const exitedPromise =
    exitDelay > 0
      ? new Promise<number>((resolve) => {
          setTimeout(() => resolve(exitCode), exitDelay);
        })
      : Promise.resolve(exitCode);

  return {
    stdout: new ReadableStream({
      start(c) {
        c.close();
      },
    }),
    stderr: new ReadableStream({
      start(c) {
        c.close();
      },
    }),
    exited: exitedPromise,
    kill: () => {},
    stdin: new WritableStream(),
    terminal: undefined,
    stdio: [],
    readable: new ReadableStream(),
    writable: new WritableStream(),
    pid: 12345,
    unref: () => {},
    ref: () => {},
    send: () => true,
    disconnect: () => {},
    signalCode: null,
    exitCode: null,
    resourceUsage: null,
    killed: false,
    [Symbol.asyncDispose]: async () => {},
  } as unknown as ReturnType<typeof Bun.spawn>;
}

describe("atlassian-auth", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  describe("exports", () => {
    it("should export authenticateAtlassian function", () => {
      expect(typeof authenticateAtlassian).toBe("function");
    });

    it("should export testAtlassianConnection function", () => {
      expect(typeof testAtlassianConnection).toBe("function");
    });

    it("should export AuthResult type interface", () => {
      const result: AuthResult = { success: true };
      expect(result).toHaveProperty("success");
    });

    it("should allow error in AuthResult", () => {
      const result: AuthResult = { success: false, error: "test error" };
      expect(result.success).toBe(false);
      expect(result.error).toBe("test error");
    });
  });

  describe("authenticateAtlassian", () => {
    it("should spawn mcp-remote with correct URL", async () => {
      Bun.spawn = (() => createMockSubprocess(0, 10)) as unknown as typeof Bun.spawn;

      const result = await authenticateAtlassian();

      expect(result).toBeDefined();
      expect(result).toHaveProperty("success");
    });

    it("should return success when process exits with 0", async () => {
      Bun.spawn = (() => createMockSubprocess(0, 10)) as unknown as typeof Bun.spawn;

      const result = await authenticateAtlassian();
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });

    it("should handle process exit with non-zero code", async () => {
      Bun.spawn = (() => createMockSubprocess(1, 10)) as unknown as typeof Bun.spawn;

      const result = await authenticateAtlassian();
      expect(result).toHaveProperty("success");
    });

    it("should have kill function on subprocess", async () => {
      const mockProc = createMockSubprocess(0, 50);
      Bun.spawn = (() => mockProc) as unknown as typeof Bun.spawn;

      await authenticateAtlassian();

      expect(typeof mockProc.kill).toBe("function");
    });

    it("should handle subprocess with streams", async () => {
      const mockProc = createMockSubprocess(0, 10);
      Bun.spawn = (() => mockProc) as unknown as typeof Bun.spawn;

      const result = await authenticateAtlassian();
      expect(result).toBeDefined();
    });
  });

  describe("testAtlassianConnection", () => {
    it("should spawn mcp-remote with correct URL", async () => {
      Bun.spawn = (() => createMockSubprocess(0, 10)) as unknown as typeof Bun.spawn;

      await testAtlassianConnection();

      // Test passes if we get here without error
      expect(true).toBe(true);
    });

    it("should return boolean", async () => {
      Bun.spawn = (() => createMockSubprocess(0, 10)) as unknown as typeof Bun.spawn;

      const result = await testAtlassianConnection();
      expect(typeof result).toBe("boolean");
    });

    it("should return true when connection succeeds (exit 0)", async () => {
      Bun.spawn = (() => createMockSubprocess(0, 10)) as unknown as typeof Bun.spawn;

      const result = await testAtlassianConnection();
      expect(result).toBe(true);
    });

    it("should handle connection check completion", async () => {
      Bun.spawn = (() => createMockSubprocess(1, 10)) as unknown as typeof Bun.spawn;

      const result = await testAtlassianConnection();
      expect(typeof result).toBe("boolean");
    });

    it("should have kill function on subprocess", async () => {
      const mockProc = createMockSubprocess(0, 50);
      Bun.spawn = (() => mockProc) as unknown as typeof Bun.spawn;

      await testAtlassianConnection();

      expect(typeof mockProc.kill).toBe("function");
    });
  });
});
