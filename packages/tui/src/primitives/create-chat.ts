import { createSignal, createEffect, onMount, onCleanup, type Accessor } from "solid-js";
import { useJiratownContext } from "../context/jiratown.tsx";

/**
 * A message in the chat stream.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
}

/**
 * Reactive primitive that manages chat state for a selected issue/agent.
 * Loads history from L1 memory and streams new agent output.
 */
export function createChat(issueId: Accessor<string | null>) {
  const { hooks, memory: _memory, orchestrator } = useJiratownContext();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);

  // Reset messages when issue changes
  createEffect(() => {
    const id = issueId();
    if (id) {
      // TODO: Load history from L1 memory once getChatHistory is implemented
      // For now, start with empty messages
      // const history = memory.l1.getChatHistory(id);
      // setMessages(history);
      setMessages([]);
    } else {
      setMessages([]);
    }
  });

  onMount(() => {
    // Listen for new agent output
    const handleOutput = ({ issueId: id, delta }: { issueId: string; delta: string }) => {
      if (id === issueId()) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "agent") {
            // Append to existing agent message
            return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
          }
          // New agent message
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "agent",
              content: delta,
              timestamp: new Date(),
            },
          ];
        });
      }
    };

    hooks.on("agent.output", handleOutput);

    onCleanup(() => {
      hooks.off("agent.output", handleOutput);
    });
  });

  /**
   * Send a message to the agent.
   */
  const send = async (content: string) => {
    const id = issueId();
    if (!id) return;

    const adapter = orchestrator.getAgent(id);
    if (!adapter) {
      // No agent found - add system message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: "⚠️ No agent found for this issue. Please spawn an agent first.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    // Check if agent is running
    if (adapter.state !== "running") {
      // Agent not running - start it first
      try {
        await adapter.start();
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            content: `⚠️ Failed to start agent: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: new Date(),
          },
        ]);
        return;
      }
    }

    // Add user message
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);

    // Send to agent
    try {
      await adapter.sendMessage(content);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: `⚠️ Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  return { messages, send };
}
