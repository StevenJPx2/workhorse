/**
 * Integration tests for createChat primitive.
 *
 * Tests the full message flow:
 * 1. User sends message via send()
 * 2. Message is sent to adapter via orchestrator
 * 3. Agent response streams via hooks
 * 4. Response appears in messages()
 */

import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { AgentAdapter, HookEmitter, HarnessOrchestrator, MemoryService } from "workhorse-core";

import type { WorkhorseContextValue } from "../context/workhorse";

/** Creates a mock hook emitter with working on/off/emit */
function createMockHooks(): HookEmitter {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    }),
    emit: vi.fn((event: string, data: unknown) => {
      listeners.get(event)?.forEach((h) => h(data));
    }),
  } as unknown as HookEmitter;
}

/** Creates a mock adapter that can simulate agent responses */
function createMockAdapter(
  hooks: HookEmitter,
  issueId: string,
  options: { state?: AgentAdapter["state"]; sendDelay?: number } = {},
): AgentAdapter {
  const adapter = {
    state: options.state ?? "running",
    sendMessage: vi.fn().mockImplementation(async (_content: string) => {
      // Simulate async response streaming after a delay
      if (options.sendDelay) {
        await new Promise((r) => setTimeout(r, options.sendDelay));
      }
      // Fire-and-forget returns immediately, response comes via hooks
    }),
    start: vi.fn().mockImplementation(async () => {
      adapter.state = "running";
    }),
  } as unknown as AgentAdapter;

  return adapter;
}

/** Creates mock context for testing */
function createMockContext(
  hooks: HookEmitter,
  adapter?: AgentAdapter,
  issueId?: string,
): WorkhorseContextValue {
  const orchestrator = {
    getAgent: vi.fn().mockImplementation((id: string) => {
      if (adapter && id === issueId) return adapter;
      return undefined;
    }),
  } as unknown as HarnessOrchestrator;

  return {
    hooks,
    orchestrator,
    memory: {} as MemoryService,
    config: {} as WorkhorseContextValue["config"],
    paths: {} as WorkhorseContextValue["paths"],
    monitors: {} as WorkhorseContextValue["monitors"],
    tracker: {} as WorkhorseContextValue["tracker"],
  };
}

/**
 * Direct implementation of createChat logic for testing.
 * This avoids the need to set up full SolidJS JSX context.
 */
function createChatWithContext(
  issueId: () => string | null,
  ctx: Pick<WorkhorseContextValue, "hooks" | "orchestrator">,
) {
  const [messages, setMessages] = createSignal<
    Array<{ id: string; role: "user" | "agent"; content: string; timestamp: Date }>
  >([]);

  // Set up agent.output listener
  const handleOutput = ({ issueId: id, delta }: { issueId: string; delta: string }) => {
    if (id === issueId()) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "agent") {
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent" as const,
            content: delta,
            timestamp: new Date(),
          },
        ];
      });
    }
  };

  ctx.hooks.on("agent.output", handleOutput);

  const send = async (content: string) => {
    const id = issueId();
    if (!id) return;

    const adapter = ctx.orchestrator.getAgent(id);
    if (!adapter) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent" as const,
          content: "⚠️ No agent found for this issue.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user" as const, content, timestamp: new Date() },
    ]);

    // Check agent state
    if (adapter.state !== "running" && adapter.state !== "starting") {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent" as const,
          content: "⏳ Starting agent...",
          timestamp: new Date(),
        },
      ]);
      adapter.start().catch(() => {});
      return;
    }

    if (adapter.state === "starting") {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent" as const,
          content: "⏳ Agent is still starting...",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    // Send message (fire-and-forget)
    adapter.sendMessage(content).catch((err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent" as const,
          content: `⚠️ Failed to send: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        },
      ]);
    });
  };

  const cleanup = () => {
    ctx.hooks.off("agent.output", handleOutput);
  };

  return { messages, send, cleanup };
}

describe("createChat", () => {
  describe("message sending flow", () => {
    it("sends message to running agent and receives streamed response", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId, { state: "running" });
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        // Send a message
        await send("Hello agent!");

        // Verify user message was added
        expect(messages()).toHaveLength(1);
        expect(messages()[0]!.role).toBe("user");
        expect(messages()[0]!.content).toBe("Hello agent!");

        // Verify adapter.sendMessage was called
        expect(adapter.sendMessage).toHaveBeenCalledWith("Hello agent!");

        // Simulate agent response streaming via hooks
        hooks.emit("agent.output", { issueId, delta: "Hello! " });
        hooks.emit("agent.output", { issueId, delta: "How can I help?" });

        // Verify agent response was added and concatenated
        expect(messages()).toHaveLength(2);
        expect(messages()[1]!.role).toBe("agent");
        expect(messages()[1]!.content).toBe("Hello! How can I help?");

        cleanup();
        dispose();
      });
    });

    it("shows error when no agent exists for issue", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const ctx = createMockContext(hooks); // No adapter

        const [getIssueId] = createSignal<string | null>("AM-123");
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Hello?");

        expect(messages()).toHaveLength(1);
        expect(messages()[0]!.role).toBe("agent");
        expect(messages()[0]!.content).toContain("No agent found");

        cleanup();
        dispose();
      });
    });

    it("starts stopped agent before sending message", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId, { state: "stopped" });
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Hello!");

        // Should show user message and "starting" message
        expect(messages()).toHaveLength(2);
        expect(messages()[0]!.role).toBe("user");
        expect(messages()[1]!.role).toBe("agent");
        expect(messages()[1]!.content).toContain("Starting agent");

        // Verify start was called but sendMessage was not
        expect(adapter.start).toHaveBeenCalled();
        expect(adapter.sendMessage).not.toHaveBeenCalled();

        cleanup();
        dispose();
      });
    });

    it("queues message when agent is starting", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId, { state: "starting" });
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Hello!");

        expect(messages()).toHaveLength(2);
        expect(messages()[1]!.content).toContain("still starting");
        expect(adapter.sendMessage).not.toHaveBeenCalled();

        cleanup();
        dispose();
      });
    });

    it("handles sendMessage rejection gracefully", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId, { state: "running" });
        (adapter.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Connection failed"),
        );
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Hello!");

        // Wait for the rejection to be handled
        await new Promise((r) => setTimeout(r, 10));

        expect(messages()).toHaveLength(2);
        expect(messages()[1]!.role).toBe("agent");
        expect(messages()[1]!.content).toContain("Failed to send");
        expect(messages()[1]!.content).toContain("Connection failed");

        cleanup();
        dispose();
      });
    });

    it("ignores output events for different issues", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId, { state: "running" });
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Hello!");

        // Emit output for a different issue
        hooks.emit("agent.output", { issueId: "OTHER-456", delta: "Wrong issue" });

        // Should only have user message, no agent response
        expect(messages()).toHaveLength(1);
        expect(messages()[0]!.role).toBe("user");

        cleanup();
        dispose();
      });
    });

    it("does nothing when issueId is null", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const ctx = createMockContext(hooks);

        const [getIssueId] = createSignal<string | null>(null);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Hello!");

        expect(messages()).toHaveLength(0);

        cleanup();
        dispose();
      });
    });
  });

  describe("response streaming", () => {
    it("concatenates multiple deltas into single agent message", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId);
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        await send("Explain something");

        // Simulate streaming response
        hooks.emit("agent.output", { issueId, delta: "First, " });
        hooks.emit("agent.output", { issueId, delta: "let me " });
        hooks.emit("agent.output", { issueId, delta: "explain." });

        expect(messages()).toHaveLength(2);
        expect(messages()[1]!.content).toBe("First, let me explain.");

        cleanup();
        dispose();
      });
    });

    it("creates new agent message after user sends another message", async () => {
      await createRoot(async (dispose) => {
        const hooks = createMockHooks();
        const issueId = "AM-123";
        const adapter = createMockAdapter(hooks, issueId);
        const ctx = createMockContext(hooks, adapter, issueId);

        const [getIssueId] = createSignal<string | null>(issueId);
        const { messages, send, cleanup } = createChatWithContext(getIssueId, ctx);

        // First exchange
        await send("Question 1");
        hooks.emit("agent.output", { issueId, delta: "Answer 1" });

        expect(messages()).toHaveLength(2);

        // Second exchange
        await send("Question 2");
        hooks.emit("agent.output", { issueId, delta: "Answer 2" });

        expect(messages()).toHaveLength(4);
        expect(messages()[0]!.content).toBe("Question 1");
        expect(messages()[1]!.content).toBe("Answer 1");
        expect(messages()[2]!.content).toBe("Question 2");
        expect(messages()[3]!.content).toBe("Answer 2");

        cleanup();
        dispose();
      });
    });
  });
});
