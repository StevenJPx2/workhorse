import type { AgentAdapter, Issue } from "@stevenjpx2/jiratown-core";
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

  // Derive selected agent ID from the currently highlighted agent in the agents list
  // oxlint-disable-next-line jiratown/no-single-use-variable
  const selectedAgentId = createMemo(() =>
    agents().length > 0 && agentIndex() >= 0 && agentIndex() < agents().length
      ? (agents()[agentIndex()]?.issueId ?? null)
      : null,
  );

  // Determine which context to use based on lastFocusedList
  // If agents list was last focused, use selected agent ID; otherwise null (spawn mode)
  // oxlint-disable-next-line jiratown/no-single-use-variable
  const chatContextId = createMemo(() =>
    ui.lastFocusedList() === "agents" ? selectedAgentId() : null,
  );

  const { messages, send } = createChat(chatContextId);
  // oxlint-disable-next-line jiratown/no-single-use-variable
  const issues = createIssues();

  /**
   * Handle chat input submission.
   * Behavior depends on which list was last focused:
   * - If agents list was focused: message the selected agent
   * - If issues list was focused: spawn a new agent for the issue
   */
  const handleSubmit = async (msg: string) => {
    // If we came from agents list and have a selected agent, message it
    if (ui.lastFocusedList() === "agents" && selectedAgentId()) {
      send(msg);
      ui.enterAgentView(selectedAgentId()!);
      return;
    }

    // Otherwise, parse input and spawn a new agent
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
              {chatContextId() ? `[${chatContextId()}] ❯ ` : "❯ "}
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
                  chatContextId()
                    ? `Message agent ${chatContextId()}...`
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
          { key: "↑↓", action: "scroll" },
          { key: "←→", action: "switch" },
          { key: "Tab", action: "cycle" },
          { key: "Enter", action: "select" },
          { key: "Ctrl+X M", action: "model" },
        ]}
      />
    </box>
  );
}
