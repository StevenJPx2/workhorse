import { createMemo, For, Show } from "solid-js";
import type { AgentAdapter } from "@jiratown/core";
import { ChatBox, StatusBar } from "../components";
import { createChat, createAgents } from "../primitives";
import { ui } from "../state/ui.ts";
import { getTheme } from "../theme.ts";

/**
 * Agent dashboard screen - shows agent chat with sidebar navigation.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ AM-456 — Fix login bug           ● running │
 * ├───────────────┬─────────────────────────────┤
 * │ ● AGENTS      │                             │
 * │ ▸ AM-456  ●   │  Agent                      │
 * │   PROJ-789 ○  │  [message content]          │
 * │               │                             │
 * │               │  You                        │
 * │               │  [message content]          │
 * ├───────────────┴─────────────────────────────┤
 * │ ❯ Type a message...                         │
 * ├─────────────────────────────────────────────┤
 * │ Enter send  s stop  ESC back         q quit │
 * └─────────────────────────────────────────────┘
 */
export function Agent() {
  const { agents, getState } = createAgents();
  const selectedId = ui.selectedAgentId;
  const theme = getTheme();

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

  const getStatusColor = (state: string) => {
    switch (state) {
      case "running":
      case "starting":
        return theme.colors.success;
      case "crashed":
        return theme.colors.warning;
      case "stopped":
      case "stopping":
        return theme.colors.error;
      default:
        return theme.colors.dim;
    }
  };

  const getStatusIcon = (state: string) => {
    switch (state) {
      case "running":
        return "●";
      case "starting":
        return "◐";
      case "crashed":
        return "⚠";
      case "stopped":
        return "■";
      default:
        return "○";
    }
  };

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      {/* Header with agent info */}
      <Show when={selectedAgent()}>
        {(agent: () => AgentAdapter) => (
          <box
            flexDirection="row"
            justifyContent="space-between"
            backgroundColor={theme.colors.surface}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
          >
            <box flexDirection="row" flexShrink={1} overflow="hidden">
              <text fg={theme.colors.accent}>
                <b>{agent().issueId}</b>
              </text>
              <text fg={theme.colors.dim}>
                {" — "}
                {agent().issue.title.length > 40
                  ? agent().issue.title.slice(0, 40) + "..."
                  : agent().issue.title}
              </text>
            </box>
            <box flexShrink={0}>
              <text fg={getStatusColor(getState(selectedId()) ?? "stopped")}>
                {getStatusIcon(getState(selectedId()) ?? "stopped")}{" "}
                {(getState(selectedId()) ?? "stopped").toUpperCase()}
              </text>
            </box>
          </box>
        )}
      </Show>

      {/* Main content: sidebar + chat */}
      <box flexDirection="row" flexGrow={1}>
        {/* Agent sidebar */}
        <box flexDirection="column" width={18} backgroundColor={theme.colors.background}>
          {/* Sidebar header */}
          <box
            backgroundColor={theme.colors.surface}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
          >
            <text fg={theme.colors.success}>
              <b>● AGENTS</b>
            </text>
          </box>

          {/* Agent list */}
          <box flexDirection="column" flexGrow={1} paddingTop={1}>
            <For each={agents()}>
              {(agent: AgentAdapter) => {
                const isSelected = () => agent.issueId === selectedId();

                return (
                  <box
                    {...({ onClick: () => handleAgentSelect(agent) } as any)}
                    backgroundColor={isSelected() ? theme.colors.selection : undefined}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg={isSelected() ? theme.colors.accent : theme.colors.text}>
                      {isSelected() ? "▸ " : "  "}
                      {agent.issueId}
                    </text>
                    <text fg={getStatusColor(getState(agent.issueId) ?? "stopped")}>
                      {" "}
                      {getStatusIcon(getState(agent.issueId) ?? "stopped")}
                    </text>
                  </box>
                );
              }}
            </For>
          </box>
        </box>

        {/* Separator */}
        <box width={1} backgroundColor={theme.colors.surface} />

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
