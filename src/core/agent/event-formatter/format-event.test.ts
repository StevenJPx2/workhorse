/**
 * Tests for formatEvent function
 */

import { describe, it, expect } from "bun:test";
import { formatEvent } from "./format-event.ts";
import type { OpenCodeEvent } from "#core/agent/orchestrator/opencode-client/types.ts";

describe("formatEvent", () => {
  it("should return null for unknown event types", () => {
    const event = { type: "unknown.event" } as unknown as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format message.part.updated with delta", () => {
    const event = {
      type: "message.part.updated",
      properties: { delta: "Hello world" },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result).not.toBeNull();
    expect(result?.content).toBe("Hello world");
    expect(result?.type).toBe("assistant");
  });

  it("should format message.part.updated with text part", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "text", text: "Some text" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("Some text");
    expect(result?.type).toBe("assistant");
  });

  it("should return null for empty text part", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "text", text: "" } },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format tool-invocation part", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "tool-invocation", name: "readFile" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("[readFile] tool-invocation");
    expect(result?.type).toBe("tool");
  });

  it("should format tool-result part", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "tool-result", name: "writeFile", state: "success" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("[writeFile] success");
    expect(result?.type).toBe("tool");
  });

  it("should format step-start part", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "step-start", name: "analyze" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("step-start: analyze");
    expect(result?.type).toBe("system");
  });

  it("should format step-finish part", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "step-finish" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("step-finish: step");
    expect(result?.type).toBe("system");
  });

  it("should return null for message.part.updated with no part or delta", () => {
    const event = {
      type: "message.part.updated",
      properties: {},
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format message.updated with assistant role", () => {
    const event = {
      type: "message.updated",
      properties: { info: { role: "assistant", summary: { raw: "Summary text" } } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("Summary text");
    expect(result?.type).toBe("assistant");
  });

  it("should format message.updated with non-assistant role", () => {
    const event = {
      type: "message.updated",
      properties: { info: { role: "user", summary: { raw: "User summary" } } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("User summary");
    expect(result?.type).toBe("system");
  });

  it("should return null for message.updated without summary", () => {
    const event = {
      type: "message.updated",
      properties: { info: { role: "assistant" } },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format session.status event", () => {
    const event = {
      type: "session.status",
      properties: { status: { type: "active", message: "Session is active" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("[active] Session is active");
    expect(result?.type).toBe("system");
  });

  it("should return null for session.status without message", () => {
    const event = {
      type: "session.status",
      properties: { status: { type: "idle" } },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format file.edited event", () => {
    const event = {
      type: "file.edited",
      properties: { file: "/path/to/file.ts" },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("File edited: /path/to/file.ts");
    expect(result?.type).toBe("tool");
  });

  it("should return null for file.edited without file", () => {
    const event = {
      type: "file.edited",
      properties: {},
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format file.watcher.updated event", () => {
    const event = {
      type: "file.watcher.updated",
      properties: { file: "/path/to/file.ts", event: "modified" },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("File modified: /path/to/file.ts");
    expect(result?.type).toBe("tool");
  });

  it("should use default event type for file.watcher.updated", () => {
    const event = {
      type: "file.watcher.updated",
      properties: { file: "/path/to/file.ts" },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("File changed: /path/to/file.ts");
  });

  it("should return null for file.watcher.updated without file", () => {
    const event = {
      type: "file.watcher.updated",
      properties: { event: "modified" },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should format todo.updated with in_progress task", () => {
    const event = {
      type: "todo.updated",
      properties: {
        todos: [
          { content: "Task 1", status: "pending" },
          { content: "Current task", status: "in_progress" },
          { content: "Task 3", status: "done" },
        ],
      },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("Working on: Current task");
    expect(result?.type).toBe("system");
  });

  it("should return null for todo.updated without in_progress task", () => {
    const event = {
      type: "todo.updated",
      properties: {
        todos: [
          { content: "Task 1", status: "pending" },
          { content: "Task 2", status: "done" },
        ],
      },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should return null for todo.updated with empty todos", () => {
    const event = {
      type: "todo.updated",
      properties: { todos: [] },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });

  it("should include timestamp in formatted message", () => {
    const event = {
      type: "message.part.updated",
      properties: { delta: "Test" },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.timestamp).toBeTruthy();
    expect(() => new Date(result!.timestamp)).not.toThrow();
  });

  it("should include unique id in formatted message", () => {
    const event = {
      type: "message.part.updated",
      properties: { delta: "Test" },
    } as OpenCodeEvent;
    const result1 = formatEvent(event);
    const result2 = formatEvent(event);
    expect(result1?.id).not.toBe(result2?.id);
  });

  it("should use default tool name when not provided", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "tool-invocation" } },
    } as OpenCodeEvent;
    const result = formatEvent(event);
    expect(result?.content).toBe("[tool] tool-invocation");
  });

  it("should handle unknown part types gracefully", () => {
    const event = {
      type: "message.part.updated",
      properties: { part: { type: "unknown" } },
    } as OpenCodeEvent;
    expect(formatEvent(event)).toBeNull();
  });
});
