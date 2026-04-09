/**
 * Error handling tests for useAtlassian hook
 *
 * Tests error paths in disconnect, addComment, and transitionIssue.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createRoot } from "solid-js";
import { useAtlassian } from "../use-atlassian.ts";

// Track which methods should throw
let shouldDisconnectThrow = false;
let shouldAddCommentThrow = false;
let shouldTransitionThrow = false;

// Mock MCP SDK
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => {
  if (shouldDisconnectThrow) {
    return Promise.reject(new Error("Disconnect failed"));
  }
  return Promise.resolve();
});
const mockCallTool = mock(() => {
  if (shouldAddCommentThrow) {
    return Promise.reject(new Error("Add comment failed"));
  }
  if (shouldTransitionThrow) {
    return Promise.reject(new Error("Transition failed"));
  }
  return Promise.resolve({
    content: [{ type: "text", text: "{}" }],
  });
});

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    callTool = mockCallTool;
  },
}));

mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class MockTransport {
    constructor() {}
  },
}));

describe("useAtlassian error handling", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockCallTool.mockClear();
    shouldDisconnectThrow = false;
    shouldAddCommentThrow = false;
    shouldTransitionThrow = false;
  });

  describe("disconnect errors", () => {
    it("should capture disconnect errors in state", async () => {
      await createRoot(async (dispose) => {
        shouldDisconnectThrow = true;

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
        });

        // Connect first
        await atlassian.connect();
        expect(atlassian.isConnected()).toBe(true);

        // Disconnect should fail
        await expect(atlassian.disconnect()).rejects.toThrow("Disconnect failed");
        expect(atlassian.error()?.message).toBe("Disconnect failed");

        dispose();
      });
    });

    it("should call onError callback for disconnect failures", async () => {
      await createRoot(async (dispose) => {
        shouldDisconnectThrow = true;
        const onError = mock(() => {});

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
          onError,
        });

        await atlassian.connect();
        await expect(atlassian.disconnect()).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(onError.mock.calls[0]?.[0]?.message).toBe("Disconnect failed");

        dispose();
      });
    });

    it("should call onConnectionChange with false even on disconnect error", async () => {
      await createRoot(async (dispose) => {
        shouldDisconnectThrow = true;
        const onConnectionChange = mock(() => {});

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
          onConnectionChange,
        });

        await atlassian.connect();
        expect(onConnectionChange).toHaveBeenCalledWith(true);

        try {
          await atlassian.disconnect();
        } catch {
          // Expected to throw
        }

        // onConnectionChange should NOT be called on error
        // because the disconnect didn't complete successfully
        expect(onConnectionChange).toHaveBeenCalledTimes(1);

        dispose();
      });
    });
  });

  describe("addComment errors", () => {
    it("should capture addComment errors in state", async () => {
      await createRoot(async (dispose) => {
        shouldAddCommentThrow = true;

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
        });

        await atlassian.connect();

        await expect(atlassian.addComment("TEST-123", "comment")).rejects.toThrow(
          "Add comment failed"
        );
        expect(atlassian.error()?.message).toBe("Add comment failed");

        dispose();
      });
    });

    it("should call onError callback for addComment failures", async () => {
      await createRoot(async (dispose) => {
        shouldAddCommentThrow = true;
        const onError = mock(() => {});

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
          onError,
        });

        await atlassian.connect();
        await expect(atlassian.addComment("TEST-123", "comment")).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(onError.mock.calls[0]?.[0]?.message).toBe("Add comment failed");

        dispose();
      });
    });

    it("should clear previous error before addComment", async () => {
      await createRoot(async (dispose) => {
        // First, create an error
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
        });

        // Manually set an error (simulating a previous operation failure)
        await atlassian.connect();

        // Now do a successful addComment
        shouldAddCommentThrow = false;
        await atlassian.addComment("TEST-123", "comment");

        // Error should be cleared
        expect(atlassian.error()).toBe(null);

        dispose();
      });
    });
  });

  describe("transitionIssue errors", () => {
    it("should capture transitionIssue errors in state", async () => {
      await createRoot(async (dispose) => {
        shouldTransitionThrow = true;

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
        });

        await atlassian.connect();

        await expect(atlassian.transitionIssue("TEST-123", "21")).rejects.toThrow(
          "Transition failed"
        );
        expect(atlassian.error()?.message).toBe("Transition failed");

        dispose();
      });
    });

    it("should call onError callback for transition failures", async () => {
      await createRoot(async (dispose) => {
        shouldTransitionThrow = true;
        const onError = mock(() => {});

        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
          onError,
        });

        await atlassian.connect();
        await expect(atlassian.transitionIssue("TEST-123", "21")).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(onError.mock.calls[0]?.[0]?.message).toBe("Transition failed");

        dispose();
      });
    });

    it("should handle non-Error throws", async () => {
      await createRoot(async (dispose) => {
        // Override to throw a string instead of Error
        mockCallTool.mockRejectedValueOnce("String error");

        const onError = mock(() => {});
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
          onError,
        });

        await atlassian.connect();
        await expect(atlassian.transitionIssue("TEST-123", "21")).rejects.toThrow(
          "String error"
        );

        // onError should still be called with an Error object
        expect(onError).toHaveBeenCalledWith(expect.any(Error));

        dispose();
      });
    });
  });

  describe("error state reset on success", () => {
    it("should clear error on successful operations after failure", async () => {
      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: false,
        });

        await atlassian.connect();

        // First make addComment fail
        shouldAddCommentThrow = true;
        await expect(atlassian.addComment("TEST-123", "comment")).rejects.toThrow();
        expect(atlassian.error()).not.toBe(null);

        // Then make it succeed
        shouldAddCommentThrow = false;
        await atlassian.addComment("TEST-123", "comment");

        // Error should be cleared
        expect(atlassian.error()).toBe(null);

        dispose();
      });
    });
  });
});
