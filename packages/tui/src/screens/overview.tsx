import type { AgentAdapter, Issue } from "@jiratown/core";
import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { AgentList, IssueList, StatusBar } from "../components";
import { createChat } from "../primitives";
import { createIssues } from "../primitives/create-issues.ts";
import { createAgents } from "../primitives/create-agents.ts";
import { ui } from "../state/ui.ts";
import { getTheme } from "../theme.ts";

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
  // Overview doesn't have a specific issue selected for chat
  const [selectedIssueId] = createSignal<string | null>(null);
  const { send } = createChat(selectedIssueId);
  const [input, setInput] = createSignal("");

  // Selected indices for each list
  const [issueIndex, setIssueIndex] = createSignal(0);
  const [agentIndex, setAgentIndex] = createSignal(0);

  // Get data for bounds checking
  const issues = createIssues();
  const agents = createAgents();

  const handleIssueSelect = (issue: Issue) => {
    ui.openSpawnModal(issue);
  };

  const handleAgentSelect = (agent: AgentAdapter) => {
    ui.enterAgentView(agent.issueId);
  };

  const handleSubmit = () => {
    const msg = input().trim();
    if (msg) {
      send(msg);
      setInput("");
    }
  };

  // Handle click on input area to focus chat
  const handleInputClick = () => {
    ui.setFocusedComponent("chat");
    ui.enterInputMode();
  };

  // Screen-specific keyboard handling for arrow navigation within lists
  useKeyboard((key) => {
    // Skip if modal is open or in input mode (global handler handles those)
    if (ui.modal() || ui.inputMode()) return;

    const focused = ui.focusedComponent();

    // Arrow key navigation within the focused list
    if (key.name === "up" || key.raw === "k") {
      if (focused === "issues" && issues().length > 0) {
        setIssueIndex((i) => Math.max(0, i - 1));
      } else if (focused === "agents" && agents().length > 0) {
        setAgentIndex((i) => Math.max(0, i - 1));
      }
      return;
    }

    if (key.name === "down" || key.raw === "j") {
      if (focused === "issues" && issues().length > 0) {
        setIssueIndex((i) => Math.min(issues().length - 1, i + 1));
      } else if (focused === "agents" && agents().length > 0) {
        setAgentIndex((i) => Math.min(agents().length - 1, i + 1));
      }
      return;
    }

    // Enter to select current item
    if (key.name === "return") {
      if (focused === "issues") {
        const issue = issues()[issueIndex()];
        if (issue) handleIssueSelect(issue);
      } else if (focused === "agents") {
        const agent = agents()[agentIndex()];
        if (agent) handleAgentSelect(agent);
      } else if (focused === "chat") {
        // Focus the input and enter input mode
        ui.enterInputMode();
      }
      return;
    }
  });

  // Check if chat is focused
  const isChatFocused = () => ui.focusedComponent() === "chat";

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
        <IssueList onSelect={handleIssueSelect} selectedIndex={issueIndex()} />
        <box width={1} backgroundColor={theme.colors.surface} />
        <AgentList onSelect={handleAgentSelect} selectedIndex={agentIndex()} />
      </box>

      {/* Command input area - highlighted when focused */}
      <box
        backgroundColor={isChatFocused() ? theme.colors.selection : theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        {...({ onClick: handleInputClick } as any)}
      >
        <text fg={theme.colors.accent}>❯ </text>
        <input
          value={input()}
          focused={isChatFocused()}
          onInput={(e) => setInput(e)}
          onSubmit={handleSubmit}
          placeholder="Ask or type a command..."
        />
      </box>

      {/* Status bar */}
      <StatusBar
        shortcuts={[
          { key: "Enter", action: "select" },
          { key: "Tab", action: "switch" },
          { key: "↑↓", action: "navigate" },
          { key: "?", action: "help" },
        ]}
      />
    </box>
  );
}
