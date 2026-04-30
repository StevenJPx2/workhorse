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
  const send = (content: string) => {
    const id = issueId();
    if (!id) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);

    // Send to agent via orchestrator
    // The orchestrator will handle injecting the message into the agent's session
    const adapter = orchestrator.get(id);
    if (adapter) {
      adapter.inject(content);
    }
  };

  return { messages, send };
}
