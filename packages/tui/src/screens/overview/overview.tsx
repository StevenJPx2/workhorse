import type { AgentAdapter, Issue } from "@jiratown/core";
import { createSignal } from "solid-js";
import { AgentList, IssueList, StatusBar } from "../../components";
import { createChat } from "../../primitives";
import { createIssues } from "../../primitives/create-issues.ts";
import { createAgents } from "../../primitives/create-agents.ts";
import { ui } from "../../state/ui.ts";
import { getTheme } from "../../theme.ts";
import { useOverviewBindings } from "./use-overview-bindings.ts";

/**
 * Overview screen - main landing page with two-pane layout.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │  ⚡ JIRATOWN                                │
 * ├─────────────────────┬───────────────────────┤
 * │  ⚡ ISSUES (3)      │  ● AGENTS (2 active)  │
 * │  ▸ AM-123 Fix...    │  ▸ AM-456   ● running │
 * │    AM-124 Add...    │    PROJ-789 ○ idle    │
 * │    AM-125 Update... │                       │
 * ├─────────────────────┴───────────────────────┤
 * │  ❯ Ask or type a command...                 │
 * ├─────────────────────────────────────────────┤
 * │  Enter select  Tab switch  ? help    q quit │
 * └─────────────────────────────────────────────┘
 *
 * Tab: cycle focus between issues, agents, and chat input
 * Arrow keys: navigate within the focused list
 * Enter: select item or submit command
 */
export function Overview() {
  const theme = getTheme();
  const [selectedIssueId] = createSignal<string | null>(null);
  const { send } = createChat(selectedIssueId);
  const [input, setInput] = createSignal("");
  const [issueIndex, setIssueIndex] = createSignal(0);
  const [agentIndex, setAgentIndex] = createSignal(0);

  const issues = createIssues();
  const agents = createAgents();

  // Setup keybindings
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
        backgroundColor={
          ui.focusedComponent() === "chat" ? theme.colors.selection : theme.colors.surface
        }
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        {...({
          onClick: () => {
            ui.setFocusedComponent("chat");
            ui.enterInputMode();
          },
        } as any)}
      >
        <text fg={theme.colors.accent}>❯ </text>
        <input
          value={input()}
          focused={ui.focusedComponent() === "chat"}
          onInput={(e) => setInput(e)}
          onSubmit={() => {
            const msg = input().trim();
            if (msg) {
              send(msg);
              setInput("");
            }
          }}
          placeholder="Ask or type a command..."
        />
      </box>

      {/* Status bar */}
      <StatusBar
        shortcuts={[
          { key: "↑↓←→", action: "navigate" },
          { key: "Tab", action: "switch" },
          { key: "Enter", action: "select" },
          { key: "Ctrl+X H", action: "help" },
        ]}
      />
    </box>
  );
}
