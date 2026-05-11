import type { AgentAdapter } from "@jiratown/core";
import { createMemo, Show } from "solid-js";
import { StatusBar } from "../components";
import { ActivityFeed } from "../components/activity-feed.tsx";
import { AgentSidebar } from "../components/agent-sidebar.tsx";
import { FileChangesPanel } from "../components/file-changes-panel.tsx";
import { createAgents, createChat } from "../primitives";
import { createActivity } from "../primitives/create-activity.ts";
import { createFileChanges } from "../primitives/create-file-changes.ts";
import { ui } from "../state/ui.ts";
import { getTheme } from "../theme.ts";

const FILES_PANEL_WIDTH = 32;

/**
 * Agent dashboard screen - shows activity feed with file changes sidebar.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AM-456 — Fix login bug                           ● running │
 * ├──────────┬────────────────────────────────┬─────────────────┤
 * │ ● AGENTS │  ⚡ ACTIVITY                   │ 📁 FILES  +42 -8│
 * │ ▸ AM-456 │  ● thinking...                 │ src/app.ts +12-3│
 * │   PROJ-1 │  ✏️ Edited src/app.ts          │ lib/util.ts +5  │
 * │          │  📄 Created test.ts            │                 │
 * │          │  [text output bubble]          │                 │
 * ├──────────┴────────────────────────────────┴─────────────────┤
 * │ Enter send  s stop  ESC back                         q quit │
 * └─────────────────────────────────────────────────────────────┘
 */
export function Agent() {
  const { agents, getState } = createAgents();
  const selectedId = ui.selectedAgentId;
  const theme = getTheme();

  const selectedAgent = createMemo(() => agents().find((a) => a.issueId === selectedId()));

  const { state: activityState } = createActivity({ issueId: selectedId });
  const { state: fileChangesState } = createFileChanges({
    worktreePath: () => selectedAgent()?.worktreePath ?? null,
  });
  const { send: sendMessage } = createChat(selectedId);

  const isChatFocused = () => ui.focusedComponent() === "chat";

  const statusColor = (s: string) =>
    s === "running" || s === "starting"
      ? theme.colors.success
      : s === "crashed"
        ? theme.colors.warning
        : s === "stopped" || s === "stopping"
          ? theme.colors.error
          : theme.colors.dim;

  const statusIcon = (s: string) =>
    s === "running"
      ? "●"
      : s === "starting"
        ? "◐"
        : s === "crashed"
          ? "!"
          : s === "stopped"
            ? "■"
            : "○";

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
            paddingX={2}
            paddingY={2}
          >
            <box flexDirection="row" flexShrink={1} overflow="hidden">
              <text fg={theme.colors.accent}>
                <b>{agent().issueId}</b>
              </text>
              <text fg={theme.colors.dim}>
                {" — "}
                {agent().issue.title.length > 30
                  ? agent().issue.title.slice(0, 30) + "..."
                  : agent().issue.title}
              </text>
              <Show when={agent().model}>
                <text fg={theme.colors.dim}>{" | "}</text>
                <text fg={theme.colors.info}>{agent().model}</text>
              </Show>
            </box>
            <box flexShrink={0}>
              <text fg={statusColor(getState(selectedId()) ?? "stopped")}>
                {statusIcon(getState(selectedId()) ?? "stopped")}{" "}
                {(getState(selectedId()) ?? "stopped").toUpperCase()}
              </text>
            </box>
          </box>
        )}
      </Show>

      {/* Main content: sidebar + activity (center) + files (right) */}
      <box flexDirection="row" flexGrow={1} paddingY={2}>
        <AgentSidebar
          agents={agents}
          selectedId={selectedId}
          getState={getState}
          onSelect={(agent) => ui.enterAgentView(agent.issueId)}
        />
        <box width={1} backgroundColor={theme.colors.surface} />

        {/* Activity feed + chat input */}
        <box flexDirection="column" flexGrow={1}>
          <box backgroundColor={theme.colors.surface} paddingX={1} paddingY={1}>
            <text fg={theme.colors.info}>
              <b>⚡ ACTIVITY</b>
            </text>
          </box>
          <ActivityFeed state={activityState} />

          {/* Chat input */}
          <box
            flexDirection="row"
            backgroundColor={isChatFocused() ? theme.colors.selection : theme.colors.surface}
            paddingX={1}
            paddingY={1}
            onMouseDown={() => {
              ui.setFocusedComponent("chat");
              ui.enterInputMode();
            }}
          >
            <text fg={theme.colors.accent}>❯{"\u00A0"}</text>
            <box flexGrow={1}>
              <input
                width="100%"
                focused={isChatFocused()}
                onSubmit={(v) => {
                  const msg = typeof v === "string" ? v.trim() : "";
                  if (msg) sendMessage(msg);
                }}
                placeholder="Send a message..."
              />
            </box>
          </box>
        </box>

        <box width={1} backgroundColor={theme.colors.surface} />
        <FileChangesPanel state={fileChangesState} width={FILES_PANEL_WIDTH} />
      </box>

      <StatusBar
        shortcuts={[
          { key: "s", action: "stop" },
          { key: "Ctrl+X M", action: "model" },
          { key: "ESC", action: "back" },
        ]}
      />
    </box>
  );
}
