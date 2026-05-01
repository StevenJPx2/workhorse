import type { AgentAdapter, Issue } from "@jiratown/core";
import { createSignal } from "solid-js";
import { AgentList, IssueList, StatusBar } from "../components";
import { createChat } from "../primitives";
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
 */
export function Overview() {
  const theme = getTheme();
  // Overview doesn't have a specific issue selected for chat
  const [selectedIssueId] = createSignal<string | null>(null);
  const { send } = createChat(selectedIssueId);
  const [input, setInput] = createSignal("");

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
        <IssueList onSelect={handleIssueSelect} />
        <box width={1} backgroundColor={theme.colors.surface} />
        <AgentList onSelect={handleAgentSelect} />
      </box>

      {/* Command input area */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.accent}>❯ </text>
        <input
          value={input()}
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
          { key: "?", action: "help" },
        ]}
      />
    </box>
  );
}
