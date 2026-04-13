/* oxlint-disable max-lines-per-file */

/**
 * Tests for useAgentStream hook
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useAgentStream } from "../use-agent-stream.ts";

// Mock the opencode client
const mockUnsubscribe = mock(() => {});
const mockSubscribeToEvents = mock(() => Promise.resolve({ unsubscribe: mockUnsubscribe }));

mock.module("#core/agent/orchestrator/opencode-client/index.ts", () => ({
  subscribeToEvents: mockSubscribeToEvents,
}));

describe("useAgentStream", () => {
  beforeEach(() => {
    mockSubscribeToEvents.mockClear();
    mockUnsubscribe.mockClear();
  });

  it("should return initial state when disabled", () => {
    createRoot((dispose) => {
      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: false,
      });

      expect(result.messages()).toEqual([]);
      expect(result.isConnected()).toBe(false);
      expect(result.error()).toBeNull();
      expect(result.lastEvent()).toBeNull();

      dispose();
    });
  });

  it("should return initial state when no ticketId", () => {
    createRoot((dispose) => {
      const result = useAgentStream({
        ticketId: "",
        enabled: true,
      });

      expect(result.messages()).toEqual([]);
      expect(result.isConnected()).toBe(false);

      dispose();
    });
  });

  it("should subscribe to events when enabled", async () => {
    createRoot(async (dispose) => {
      useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      // Wait for subscription
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSubscribeToEvents).toHaveBeenCalledWith(
        "TEST-123",
        expect.any(Function),
        expect.any(Function),
      );

      dispose();
    });
  });

  it("should add messages on event callback", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      // Wait for subscription
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate an event
      if (eventCallback) {
        eventCallback({
          type: "message.part.updated",
          properties: { part: { type: "text", text: "Hello world" } },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].content).toBe("Hello world");
      expect(result.isConnected()).toBe(true);

      dispose();
    });
  });

  it("should handle streaming text with delta", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate streaming text
      if (eventCallback) {
        eventCallback({
          type: "message.part.updated",
          properties: { delta: "Hello " },
        });
        eventCallback({
          type: "message.part.updated",
          properties: { delta: "world" },
        });
      }

      expect(result.messages()).toHaveLength(2);
      expect(result.messages()[0].content).toBe("Hello ");
      expect(result.messages()[1].content).toBe("world");

      dispose();
    });
  });

  it("should handle tool invocation events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "message.part.updated",
          properties: {
            part: { type: "tool-invocation", name: "readFile", state: "running" },
          },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].type).toBe("tool");
      expect(result.messages()[0].content).toContain("readFile");

      dispose();
    });
  });

  it("should handle step events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "message.part.updated",
          properties: {
            part: { type: "step-start", name: "analyze" },
          },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].type).toBe("system");

      dispose();
    });
  });

  it("should handle message.updated events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "message.updated",
          properties: {
            info: { role: "assistant", summary: { raw: "Summary text" } },
          },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].content).toBe("Summary text");

      dispose();
    });
  });

  it("should handle session.status events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "session.status",
          properties: { status: { type: "info", message: "Session ready" } },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].content).toContain("Session ready");

      dispose();
    });
  });

  it("should handle file.edited events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "file.edited",
          properties: { file: "/path/to/file.ts" },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].content).toContain("file.ts");
      expect(result.messages()[0].type).toBe("tool");

      dispose();
    });
  });

  it("should handle file.watcher.updated events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "file.watcher.updated",
          properties: { file: "/path/to/file.ts", event: "created" },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].content).toContain("created");

      dispose();
    });
  });

  it("should handle todo.updated events", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "todo.updated",
          properties: {
            todos: [
              { content: "Fix bug", status: "done" },
              { content: "Add tests", status: "in_progress" },
            ],
          },
        });
      }

      expect(result.messages()).toHaveLength(1);
      expect(result.messages()[0].content).toBe("Working on: Add tests");

      dispose();
    });
  });

  it("should handle unknown event types gracefully", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Unknown event type should be ignored
      if (eventCallback) {
        eventCallback({
          type: "unknown.event",
          properties: {},
        });
      }

      expect(result.messages()).toHaveLength(0);

      dispose();
    });
  });

  it("should handle subscription errors", async () => {
    mockSubscribeToEvents.mockImplementation(() => Promise.reject(new Error("Connection failed")));

    createRoot(async (dispose) => {
      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.error()).toBe("Connection failed");
      expect(result.isConnected()).toBe(false);

      dispose();
    });
  });

  it("should handle error callback from subscription", async () => {
    createRoot(async (dispose) => {
      let errorCallback: ((error: Error) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent, onError) => {
        errorCallback = onError;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (errorCallback) {
        errorCallback(new Error("Stream error"));
      }

      expect(result.error()).toBe("Stream error");
      expect(result.isConnected()).toBe(false);

      dispose();
    });
  });

  it("should clear messages", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        eventCallback({
          type: "message.part.updated",
          properties: { delta: "Hello" },
        });
      }

      expect(result.messages()).toHaveLength(1);

      result.clear();

      expect(result.messages()).toHaveLength(0);

      dispose();
    });
  });

  it("should limit messages to maxMessages", async () => {
    createRoot(async (dispose) => {
      let eventCallback: ((event: unknown) => void) | undefined;

      mockSubscribeToEvents.mockImplementation((ticketId, onEvent) => {
        eventCallback = onEvent;
        return Promise.resolve({ unsubscribe: mockUnsubscribe });
      });

      const result = useAgentStream({
        ticketId: "TEST-123",
        enabled: true,
        maxMessages: 5,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (eventCallback) {
        for (let i = 0; i < 10; i++) {
          eventCallback({
            type: "message.part.updated",
            properties: { delta: `Message ${i}` },
          });
        }
      }

      expect(result.messages()).toHaveLength(5);
      expect(result.messages()[0].content).toBe("Message 5");
      expect(result.messages()[4].content).toBe("Message 9");

      dispose();
    });
  });

  it("should unsubscribe on disable", async () => {
    let enabled = true;

    createRoot(async (dispose) => {
      useAgentStream({
        ticketId: "TEST-123",
        enabled,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Disable the stream
      enabled = false;

      dispose();
    });

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
