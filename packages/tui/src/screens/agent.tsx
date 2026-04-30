import { createMemo, For, Show } from "solid-js";
import type { AgentAdapter } from "@jiratown/core";
import { ChatBox, StatusBar } from "../components";
import { createChat, createAgents } from "../primitives";
import { ui } from "../state/ui.ts";
import { theme } from "../theme.ts";

/**
 * Formats duration since agent started.
 */
function formatDuration(startedAt: Date): string {
  const ms = Date.now() - startedAt.getTime();
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Agent dashboard screen - shows agent chat with sidebar navigation.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ AM-456 — Fix login bug           ● running │
 * ├───────────────┬─────────────────────────────┤
 * │ AGENTS        │ (Chat area with agent)     │
 * │ ▸ AM-456 ● 2h │                            │
 * │   PROJ-789    │                            │
 * ├───────────────┴─────────────────────────────┤
 * │ [Enter]send  [s]top  [ESC]back      q:quit │
 * └─────────────────────────────────────────────┘
 */
export function Agent() {
  const agents = createAgents();
  const selectedId = ui.selectedAgentId;

  const selectedAgent = createMemo(() => agents().find((a) => a.issueId === selectedId()));

  const issueIdAccessor = () => selectedId();
  const { messages, send } = createChat(issueIdAccessor);

  const handleAgentSelect = (agent: AgentAdapter) => {
    ui.enterAgentView(agent.issueId);
  };

  const _handleStop = () => {
    const agent = selectedAgent();
    if (agent) {
      agent.stop();
    }
  };

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header with agent info */}
      <Show when={selectedAgent()}>
        {(agent) => (
          <box flexDirection="row" justifyContent="space-between" borderStyle="single" padding={1}>
            <text>
              <b>
                {agent().issueKey} — {agent().issueTitle}
              </b>
            </text>
            <text fg={agent().status === "blocked" ? theme.colors.warning : theme.colors.success}>
              {agent().status === "blocked" ? "⚠ BLOCKED" : "● running"}
            </text>
          </box>
        )}
      </Show>

      {/* Main content: sidebar + chat */}
      <box flexDirection="row" flexGrow={1}>
        {/* Agent sidebar */}
        <box flexDirection="column" width={15} borderStyle="single">
          <text>
            <b>AGENTS</b>
          </text>
          <For each={agents()}>
            {(agent) => (
              <box
                onClick={() => handleAgentSelect(agent)}
                backgroundColor={
                  agent.issueId === selectedId() ? theme.colors.selection : undefined
                }
              >
                <text>
                  {agent.issueId === selectedId() ? "▸ " : "  "}
                  {agent.issueKey}
                </text>
                <text fg={theme.colors.dim}>
                  {agent.status === "running" ? "●" : "○"} {formatDuration(agent.startedAt)}
                </text>
                <Show when={agent.status === "blocked"}>
                  <text fg={theme.colors.warning}>⚠ blocked</text>
                </Show>
              </box>
            )}
          </For>
        </box>

        {/* Chat area */}
        <ChatBox messages={messages} onSend={send} placeholder="Type a message to the agent..." />
      </box>

      {/* Status bar */}
      <StatusBar
        shortcuts={[
          { key: "Enter", action: "send" },
          { key: "s", action: "stop" },
          { key: "ESC", action: "back" },
        ]}
      />
    </box>
  );
}
