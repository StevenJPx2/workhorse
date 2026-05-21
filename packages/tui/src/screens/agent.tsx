import { Show, createEffect, createMemo, createSignal } from "solid-js";
import type { AgentAdapter } from "workhorse-core";

import { StatusBar } from "../components";
import { ActivityFeed } from "../components/activity-feed.tsx";
import { AgentSidebar } from "../components/agent-sidebar";
import { FileChangesPanel } from "../components/file-changes-panel.tsx";
import { useWorkhorseContext } from "../context/workhorse.tsx";
import { createAgents, createChat, createIssueStatus } from "../primitives";
import { createActivity } from "../primitives/create-activity.ts";
import { createFileChanges } from "../primitives/create-file-changes.ts";
import { createIssueStatuses } from "../primitives/create-issue-statuses.ts";
import { createMonitors } from "../primitives/create-monitors.ts";
import { ui } from "../state/ui";
import { getTheme } from "../theme.ts";
import { AgentHeader } from "./agent/header.tsx";
import { useAgentBindings } from "./agent/use-bindings.ts";

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
  const { monitors, orchestrator } = useWorkhorseContext();
  const { agents, getState } = createAgents();
  const selectedId = ui.selectedAgentId;
  const theme = getTheme();

  // Sidebar navigation index
  const [sidebarIndex, setSidebarIndex] = createSignal(0);

  // Keep sidebar index in sync with selected agent
  createEffect(() => {
    const idx = agents().findIndex((a) => a.issueId === selectedId());
    if (idx >= 0) setSidebarIndex(idx);
  });

  // Setup keyboard navigation for sidebar
  useAgentBindings({
    agents,
    sidebarIndex,
    setSidebarIndex,
    onAgentSelect: (agent) => ui.enterAgentView(agent.issueId),
  });

  const selectedAgent = createMemo(() =>
    agents().find((a) => a.issueId === selectedId()),
  );

  const { state: monitorState } = createMonitors({
    monitors,
    // Monitors are keyed by internal issue.id (UUID), not externalId
    issueId: () => selectedAgent()?.issue.id ?? null,
  });

  const { state: issueStatusState } = createIssueStatus({
    issueId: () => selectedAgent()?.issue.externalId ?? null,
  });

  // Track live issue statuses for all agents in the sidebar
  const { getStatus: getIssueStatus } = createIssueStatuses({
    issueIds: createMemo(() => agents().map((a) => a.issue.externalId)),
  });

  const { state: activityState } = createActivity({ issueId: selectedId });
  const { state: fileChangesState } = createFileChanges({
    worktreePath: () => selectedAgent()?.worktreePath ?? null,
  });
  const { send: sendMessage } = createChat(selectedId);
  const [inputValue, setInputValue] = createSignal("");

  const isChatFocused = () => ui.focusedComponent() === "chat";

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
          <AgentHeader
            agent={agent}
            agentState={getState(selectedId())}
            monitorState={monitorState}
            issueStatusState={issueStatusState}
          />
        )}
      </Show>

      {/* Main content: sidebar + activity (center) + files (right) */}
      <box flexDirection="row" flexGrow={1}>
        <AgentSidebar
          agents={agents}
          selectedId={selectedId}
          selectedIndex={sidebarIndex}
          getState={getState}
          getIssueStatus={getIssueStatus}
          onSelect={(agent) => ui.enterAgentView(agent.issueId)}
        />
        <box width={1} backgroundColor={theme.colors.surface} />

        {/* Activity feed + chat input */}
        <box flexDirection="column" flexGrow={1} marginBottom={1}>
          <box backgroundColor={theme.colors.surface} paddingX={1} zIndex={2}>
            <text fg={theme.colors.info}>
              <b>⚡ ACTIVITY</b>
            </text>
          </box>
          <ActivityFeed state={activityState} />
          {/* Chat input */}
          <box
            flexDirection="row"
            backgroundColor={
              isChatFocused() ? theme.colors.selection : theme.colors.surface
            }
            paddingX={1}
            paddingY={1}
            gap={1}
            onMouseDown={() => {
              ui.setFocusedComponent("chat");
              ui.enterInputMode();
            }}
          >
            <text fg={theme.colors.accent}>❯</text>
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
        </box>

        <box width={1} backgroundColor={theme.colors.surface} />
        <FileChangesPanel state={fileChangesState} width={FILES_PANEL_WIDTH} />
      </box>

      <StatusBar
        shortcuts={[
          { key: "j/k", action: "navigate" },
          { key: "Enter", action: "select" },
          {
            key: "s",
            action: (() => {
              const state = getState(selectedId());
              return state === "running" || state === "starting"
                ? "stop"
                : "start";
            })(),
            onActivate: () => {
              const agentId = selectedId();
              if (!agentId) return;
              const agent = orchestrator.getAgent(agentId);
              if (!agent) return;
              if (agent.state === "running" || agent.state === "starting") {
                void agent.stop();
              } else if (
                agent.state === "stopped" ||
                agent.state === "crashed"
              ) {
                void agent.start();
              }
            },
          },
          { key: "Ctrl+X M", action: "model" },
          { key: "ESC", action: "back" },
        ]}
      />
    </box>
  );
}
