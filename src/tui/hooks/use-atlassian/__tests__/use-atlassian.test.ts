/**
 * Tests for useAtlassian hook
 *
 * Mocks ./client.ts to test hook logic without requiring real Atlassian MCP connection
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createRoot } from "solid-js";

// Mock AtlassianClient before importing the hook
const mockConnect = mock(() => Promise.resolve());
const mockDisconnect = mock(() => Promise.resolve());
const mockFetchIssue = mock(() =>
  Promise.resolve({ key: "AM-123", summary: "Test issue", status: "In Progress" }),
);
const mockAddComment = mock(() => Promise.resolve());
const mockTransitionIssue = mock(() => Promise.resolve());

let mockIsConnected = false;

const MockAtlassianClient = class {
  get isConnected() {
    return mockIsConnected;
  }
  connect = mockConnect;
  disconnect = mockDisconnect;
  fetchIssue = mockFetchIssue;
  addComment = mockAddComment;
  transitionIssue = mockTransitionIssue;
};

mock.module("./client.ts", () => ({
  AtlassianClient: MockAtlassianClient,
  createAtlassianClient: (_opts: { cloudId: string }) => new MockAtlassianClient(),
}));

describe("useAtlassian", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockFetchIssue.mockClear();
    mockAddComment.mockClear();
    mockTransitionIssue.mockClear();
    mockIsConnected = false;

    mockConnect.mockImplementation(() => {
      mockIsConnected = true;
      return Promise.resolve();
    });
    mockDisconnect.mockImplementation(() => {
      mockIsConnected = false;
      return Promise.resolve();
    });
    mockFetchIssue.mockImplementation(() =>
      Promise.resolve({ key: "AM-123", summary: "Test issue", status: "In Progress" }),
    );
    mockAddComment.mockImplementation(() => Promise.resolve());
    mockTransitionIssue.mockImplementation(() => Promise.resolve());
  });

  describe("initial state", () => {
    it("should start disconnected", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      createRoot((dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        expect(atlassian.isConnected()).toBe(false);
        expect(atlassian.isConnecting()).toBe(false);
        expect(atlassian.error()).toBeNull();

        dispose();
      });
    });

    it("should return all required methods", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      createRoot((dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        expect(typeof atlassian.connect).toBe("function");
        expect(typeof atlassian.disconnect).toBe("function");
        expect(typeof atlassian.fetchIssue).toBe("function");
        expect(typeof atlassian.addComment).toBe("function");
        expect(typeof atlassian.transitionIssue).toBe("function");

        dispose();
      });
    });
  });

  describe("resolveCloudId", () => {
    it("should accept cloudId as a string", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "mycompany.atlassian.net" });
        await atlassian.connect();
        expect(mockConnect).toHaveBeenCalled();
        dispose();
      });
    });

    it("should accept cloudId as a getter function", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: () => "mycompany.atlassian.net" });
        await atlassian.connect();
        expect(mockConnect).toHaveBeenCalled();
        dispose();
      });
    });

    it("should throw when no cloudId is provided and connect is called", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({});

        try {
          await atlassian.connect();
          expect(false).toBe(true); // Should not reach here
        } catch (e: any) {
          expect(e.message).toContain("Jira cloud ID is not configured");
        }

        dispose();
      });
    });

    it("should throw when cloudId getter returns undefined", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: () => undefined });

        try {
          await atlassian.connect();
          expect(false).toBe(true);
        } catch (e: any) {
          expect(e.message).toContain("Jira cloud ID is not configured");
        }

        dispose();
      });
    });
  });

  describe("connect", () => {
    it("should connect and set isConnected to true", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        await atlassian.connect();

        expect(mockConnect).toHaveBeenCalled();
        dispose();
      });
    });

    it("should not connect twice if already connected", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        await atlassian.connect();
        mockConnect.mockClear();

        // Simulate already connected
        mockIsConnected = true;
        await atlassian.connect();

        // Should not call connect again
        expect(mockConnect).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should call onConnectionChange on connect", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      const onConnectionChange = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          onConnectionChange,
        });
        await atlassian.connect();

        expect(onConnectionChange).toHaveBeenCalledWith(true);
        dispose();
      });
    });

    it("should handle connection errors", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      mockConnect.mockImplementation(() => Promise.reject(new Error("Connection refused")));

      const onError = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net", onError });

        try {
          await atlassian.connect();
        } catch (e: any) {
          expect(e.message).toBe("Connection refused");
        }

        expect(onError).toHaveBeenCalled();
        expect(atlassian.error()?.message).toBe("Connection refused");
        dispose();
      });
    });

    it("should not allow duplicate connection attempts", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      // Make connect slow
      let resolveConnect!: () => void;
      mockConnect.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = () => {
              mockIsConnected = true;
              resolve();
            };
          }),
      );

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        const p1 = atlassian.connect();
        const p2 = atlassian.connect(); // Should return same promise

        resolveConnect();
        await Promise.all([p1, p2]);

        // connect should only be called once
        expect(mockConnect).toHaveBeenCalledTimes(1);
        dispose();
      });
    });
  });

  describe("disconnect", () => {
    it("should disconnect when connected", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        await atlassian.connect();
        await atlassian.disconnect();

        expect(mockDisconnect).toHaveBeenCalled();
        dispose();
      });
    });

    it("should call onConnectionChange(false) on disconnect", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      const onConnectionChange = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({
          cloudId: "test.atlassian.net",
          onConnectionChange,
        });
        await atlassian.connect();
        onConnectionChange.mockClear();
        await atlassian.disconnect();

        expect(onConnectionChange).toHaveBeenCalledWith(false);
        dispose();
      });
    });

    it("should not disconnect if not connected", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });
        // Don't connect first
        await atlassian.disconnect();

        expect(mockDisconnect).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should handle disconnect errors", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      mockDisconnect.mockImplementation(() => Promise.reject(new Error("Disconnect failed")));

      const onError = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net", onError });
        await atlassian.connect();

        try {
          await atlassian.disconnect();
        } catch (e: any) {
          expect(e.message).toBe("Disconnect failed");
        }

        expect(onError).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("fetchIssue", () => {
    it("should auto-connect and fetch an issue", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        const issue = await atlassian.fetchIssue("AM-123");

        expect(mockConnect).toHaveBeenCalled();
        expect(mockFetchIssue).toHaveBeenCalledWith("AM-123");
        expect(issue.key).toBe("AM-123");
        dispose();
      });
    });

    it("should handle fetch errors", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      mockFetchIssue.mockImplementation(() => Promise.reject(new Error("Issue not found")));

      const onError = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net", onError });

        try {
          await atlassian.fetchIssue("NOT-EXIST");
        } catch (e: any) {
          expect(e.message).toBe("Issue not found");
        }

        expect(onError).toHaveBeenCalled();
        expect(atlassian.error()?.message).toBe("Issue not found");
        dispose();
      });
    });
  });

  describe("addComment", () => {
    it("should auto-connect and add a comment", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await atlassian.addComment("AM-123", "This is a comment");

        expect(mockAddComment).toHaveBeenCalledWith("AM-123", "This is a comment");
        dispose();
      });
    });

    it("should handle addComment errors", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      mockAddComment.mockImplementation(() => Promise.reject(new Error("Comment failed")));

      const onError = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net", onError });

        try {
          await atlassian.addComment("AM-123", "Comment");
        } catch (e: any) {
          expect(e.message).toBe("Comment failed");
        }

        expect(atlassian.error()?.message).toBe("Comment failed");
        dispose();
      });
    });
  });

  describe("transitionIssue", () => {
    it("should auto-connect and transition an issue", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        await atlassian.transitionIssue("AM-123", "41");

        expect(mockTransitionIssue).toHaveBeenCalledWith("AM-123", "41");
        dispose();
      });
    });

    it("should handle transitionIssue errors", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      mockTransitionIssue.mockImplementation(() => Promise.reject(new Error("Transition failed")));

      const onError = mock(() => {});

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net", onError });

        try {
          await atlassian.transitionIssue("AM-123", "41");
        } catch (e: any) {
          expect(e.message).toBe("Transition failed");
        }

        expect(atlassian.error()?.message).toBe("Transition failed");
        dispose();
      });
    });
  });

  describe("autoConnect", () => {
    it("should auto-connect when autoConnect is true and cloudId is provided", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");

      await createRoot(async (dispose) => {
        useAtlassian({
          cloudId: "test.atlassian.net",
          autoConnect: true,
        });

        // Give the auto-connect a moment to run
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockConnect).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("error handling with non-Error", () => {
    it("should wrap non-Error exceptions in connect", async () => {
      const { useAtlassian } = await import("./use-atlassian.ts");
      mockConnect.mockImplementation(() => Promise.reject("string error"));

      await createRoot(async (dispose) => {
        const atlassian = useAtlassian({ cloudId: "test.atlassian.net" });

        try {
          await atlassian.connect();
        } catch (e: any) {
          expect(e instanceof Error).toBe(true);
          expect(e.message).toBe("string error");
        }

        dispose();
      });
    });
  });
});
