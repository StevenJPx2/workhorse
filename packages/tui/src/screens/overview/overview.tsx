import type { AgentAdapter, Issue } from "@jiratown/core";
import { createMemo, createSignal } from "solid-js";
import { AgentList, IssueList, StatusBar } from "../../components";
import { useJiratownContext } from "../../context/jiratown.tsx";
import { createChat } from "../../primitives";
import { createAgents } from "../../primitives/create-agents.ts";
import { createIssues } from "../../primitives/create-issues.ts";
import { ui } from "../../state/ui.ts";
import { getTheme } from "../../theme.ts";
import { useOverviewBindings } from "./use-overview-bindings.ts";

/**
 * Overview screen - main landing page with two-pane layout (issues | agents).
 * Tab cycles focus, arrow keys navigate, Enter selects.
 */
export function Overview() {
  const theme = getTheme();
  const { paths, tracker, orchestrator } = useJiratownContext();
  const [issueIndex, setIssueIndex] = createSignal(0);
  const [agentIndex, setAgentIndex] = createSignal(0);
  const { agents } = createAgents();

  // Derive selected issue ID from the currently highlighted agent
  // oxlint-disable-next-line jiratown/no-single-use-variable
  const selectedIssueId = createMemo(() =>
    agents().length > 0 && agentIndex() >= 0 && agentIndex() < agents().length
      ? (agents()[agentIndex()]?.issueId ?? null)
      : null,
  );

  const { messages, send } = createChat(selectedIssueId);
  // oxlint-disable-next-line jiratown/no-single-use-variable
  const issues = createIssues();

  /** Handle chat input - send to agent or spawn new agent for issue */
  const handleSubmit = async (msg: string) => {
    const agentId = selectedIssueId();

    if (agentId) {
      send(msg);
      ui.enterAgentView(agentId);
      return;
    }

    try {
      const issue = await tracker.parseInput(msg);
      await orchestrator
        .spawn({
          issue,
          repoPath: paths.worktreesRoot.replace(/-worktrees$/, ""),
        })
        .then((agent) => agent.start());
      ui.enterAgentView(issue.externalId);
    } catch (err) {
      console.error("Failed to create agent:", err);
    }
  };

  useOverviewBindings({
    issues,
    agents,
    issueIndex,
    setIssueIndex,
    agentIndex,
    setAgentIndex,
    onIssueSelect: (issue: Issue) => ui.openSpawnModal(issue),
    onAgentSelect: (agent: AgentAdapter) => ui.enterAgentView(agent.issueId),
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      {/* Header */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        justifyContent="space-between"
        flexDirection="row"
      >
        <box>
          <text fg={theme.colors.accent}>
            <b>⚡ JIRATOWN</b>
          </text>
        </box>
        <box>
          <text fg={theme.colors.dim}>AI-powered issue management</text>
        </box>
      </box>

      {/* Main content area - issues/agents side by side */}
      <box flexDirection="row" flexGrow={1}>
        <IssueList
          onSelect={(issue: Issue) => ui.openSpawnModal(issue)}
          selectedIndex={issueIndex()}
        />
        <box width={1} backgroundColor={theme.colors.surface} />
        <AgentList
          onSelect={(agent: AgentAdapter) => ui.enterAgentView(agent.issueId)}
          selectedIndex={agentIndex()}
        />
      </box>

      {/* Command input area - highlighted when focused */}
      <box
        flexDirection="column"
        backgroundColor={
          ui.focusedComponent() === "chat" ? theme.colors.selection : theme.colors.surface
        }
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        onMouseDown={() => {
          ui.setFocusedComponent("chat");
          ui.enterInputMode();
        }}
      >
        {/* Show recent messages if any */}
        {messages().length > 0 && (
          <box flexDirection="column" marginBottom={1}>
            {messages()
              .slice(-3)
              .map((msg) => (
                <text fg={msg.role === "user" ? theme.colors.info : theme.colors.success}>
                  {msg.role === "user" ? "You: " : "Agent: "}
                  {msg.content.slice(0, 60)}
                  {msg.content.length > 60 ? "..." : ""}
                </text>
              ))}
          </box>
        )}
        <box flexDirection="row" width="100%" alignItems="stretch">
          <box flexShrink={0}>
            <text fg={theme.colors.accent}>
              {selectedIssueId() ? `[${selectedIssueId()}] ❯ ` : "❯ "}
            </text>
          </box>
          <box flexGrow={1} flexBasis={0}>
            {/* Hide input when modal is open to prevent it from capturing Enter */}
            {!ui.modal() && (
              <input
                width="100%"
                focused={ui.focusedComponent() === "chat"}
                onSubmit={(value) => {
                  // value can be string or SubmitEvent - handle both
                  const msg = typeof value === "string" ? value.trim() : "";
                  if (msg) {
                    handleSubmit(msg);
                  } else {
                    // Empty Enter: show spawn modal for selected issue
                    const issue = issues()[issueIndex()];
                    if (issue) {
                      ui.openSpawnModal(issue);
                    }
                  }
                }}
                placeholder={
                  selectedIssueId()
                    ? `Message agent ${selectedIssueId()}...`
                    : "Type a task or issue key..."
                }
              />
            )}
          </box>
        </box>
      </box>

      {/* Status bar */}
      <StatusBar
        shortcuts={[
          { key: "↑↓←→", action: "navigate" },
          { key: "Tab", action: "switch" },
          { key: "Enter", action: "select" },
          { key: "Ctrl+X M", action: "model" },
          { key: "Ctrl+X H", action: "help" },
        ]}
      />
    </box>
  );
}
