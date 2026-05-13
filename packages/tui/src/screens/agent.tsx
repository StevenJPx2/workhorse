import { createMemo, createSignal, Show } from "solid-js";
import type { AgentAdapter } from "workhorse-core";
import { MonitorIndicator, StatusBar, NotificationsBar, BlockedView } from "../components";
import { ActivityFeed } from "../components/activity-feed.tsx";
import { AgentSidebar } from "../components/agent-sidebar.tsx";
import { FileChangesPanel } from "../components/file-changes-panel.tsx";
import { WorkhorseStatus } from "../components/workhorse-status.tsx";
import { useWorkhorseContext } from "../context/workhorse.tsx";
import { createAgents, createChat, createIssueStatus, createNotifications } from "../primitives";
import { createActivity } from "../primitives/create-activity.ts";
import { createFileChanges } from "../primitives/create-file-changes.ts";
import { createMonitors } from "../primitives/create-monitors.ts";
import { ui } from "../state/ui.ts";
import { getTheme } from "../theme.ts";
import {
  getBlockingMessage,
  createHandleResume,
  handleHandoff,
  handleViewInJira,
  handleViewNotificationInJira,
  createHandleCancel,
  statusColor,
  statusIcon,
  useBlockedShortcuts,
  AGENT_BASE_SHORTCUTS,
  AGENT_BLOCKED_SHORTCUTS,
  FILES_PANEL_WIDTH,
} from "./agent-helpers.ts";

export function Agent() {
  const { monitors, tracker, hooks, memory } = useWorkhorseContext();
  const { agents, getState } = createAgents();
  const selectedId = ui.selectedAgentId;
  const theme = getTheme();
  const selectedAgent = createMemo(() => agents().find((a) => a.issueId === selectedId()));

  const { state: monitorState } = createMonitors({
    monitors,
    issueId: () => selectedAgent()?.issue.externalId ?? null,
  });
  const { state: issueStatusState } = createIssueStatus({
    issueId: () => selectedAgent()?.issue.externalId ?? null,
  });
  const { state: activityState } = createActivity({ issueId: selectedId });
  const { state: fileChangesState } = createFileChanges({
    worktreePath: () => selectedAgent()?.worktreePath ?? null,
  });
  const { send: sendMessage } = createChat(selectedId);
  const {
    state: notificationsState,
    acknowledge,
    acknowledgeAll,
  } = createNotifications({
    issueId: () => selectedAgent()?.issue.externalId ?? null,
  });

  const isBlocked = () => issueStatusState().status === "blocked" && selectedAgent() !== undefined;
  const [inputValue, setInputValue] = createSignal("");
  const isChatFocused = () => ui.focusedComponent() === "chat";
  const blockingMessage = () => getBlockingMessage(notificationsState().notifications);
  // ─── Action handlers ────────────────────────────────────────────────
  const handleResume = createHandleResume(memory, hooks);
  const onHandoff = handleHandoff;
  const onViewInJira = () => handleViewInJira(selectedAgent());
  const handleCancel = createHandleCancel(tracker);
  // Blocked-state keyboard shortcuts (r, h, v, c)
  useBlockedShortcuts(isBlocked, {
    handleResume: () => handleResume(selectedAgent()?.issue.externalId),
    onHandoff,
    onViewInJira,
    handleCancel: () => handleCancel(selectedAgent()),
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      {/* Header */}
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
            <box flexDirection="row" flexShrink={0}>
              <WorkhorseStatus status={issueStatusState().status} />
              <text fg={theme.colors.dim}>{"\u00A0|\u00A0"}</text>
              <MonitorIndicator state={monitorState()} />
              <text fg={theme.colors.dim}>{"\u00A0|\u00A0"}</text>
              <text fg={statusColor(getState(selectedId()) ?? "stopped")}>
                {statusIcon(getState(selectedId()) ?? "stopped")}
                {"\u00A0"}
                {(getState(selectedId()) ?? "stopped").toUpperCase()}
              </text>
            </box>
          </box>
        )}
      </Show>

      {/* Main content: sidebar + center + files */}
      <box flexDirection="row" flexGrow={1} paddingBottom={1}>
        <AgentSidebar
          agents={agents}
          selectedId={selectedId}
          getState={getState}
          onSelect={(agent) => ui.enterAgentView(agent.issueId)}
        />
        <box width={1} backgroundColor={theme.colors.surface} />

        {/* Center: Notifications → BlockedView → Activity → Chat */}
        <box flexDirection="column" flexGrow={1}>
          <NotificationsBar
            state={notificationsState()}
            onAcknowledge={acknowledge}
            onAcknowledgeAll={acknowledgeAll}
            onViewInJira={(n) => handleViewNotificationInJira(n, selectedAgent())}
          />

          <Show when={isBlocked()}>
            <BlockedView
              message={blockingMessage()}
              issueUrl={selectedAgent()?.issue.url}
              onResume={() => handleResume(selectedAgent()?.issue.externalId)}
              onHandoff={onHandoff}
              onViewInJira={onViewInJira}
              onCancel={() => handleCancel(selectedAgent())}
            />
          </Show>

          <box backgroundColor={theme.colors.surface} paddingX={1}>
            <text fg={theme.colors.info}>
              <b>⚡ ACTIVITY</b>
            </text>
          </box>
          <ActivityFeed state={activityState} />

          <Show when={!isBlocked()}>
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
                  value={inputValue()}
                  onInput={(v) => setInputValue(v)}
                  onSubmit={(v) => {
                    const msg = typeof v === "string" ? v.trim() : "";
                    if (msg) {
                      sendMessage(msg);
                      setInputValue("");
                    }
                  }}
                  placeholder="Send a message..."
                />
              </box>
            </box>
          </Show>
        </box>

        <box width={1} backgroundColor={theme.colors.surface} />
        <FileChangesPanel state={fileChangesState} width={FILES_PANEL_WIDTH} />
      </box>

      <StatusBar shortcuts={isBlocked() ? AGENT_BLOCKED_SHORTCUTS : AGENT_BASE_SHORTCUTS} />
    </box>
  );
}
