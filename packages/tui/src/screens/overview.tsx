import { createSignal } from "solid-js";
import type { Issue, AgentAdapter } from "@jiratown/core";
import { ChatBox, IssueList, AgentList, StatusBar } from "../components";
import { createChat } from "../primitives";
import { ui } from "../state/ui.ts";

/**
 * Overview screen - main landing page with chat, issues, and agents.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ Jiratown                                    │
 * ├─────────────────────────────────────────────┤
 * │ (Chat area - welcome message)               │
 * ├─────────────────────────────────────────────┤
 * │ ISSUES              │ AGENTS                │
 * │ ▸ AM-123 Fix login  │ ▸ AM-456 ● 2h blocked │
 * ├─────────────────────┴───────────────────────┤
 * │ [Enter]select  [?]help               q:quit │
 * └─────────────────────────────────────────────┘
 */
export function Overview() {
  // Overview doesn't have a specific issue selected for chat
  const [selectedIssueId] = createSignal<string | null>(null);
  const { messages, send } = createChat(selectedIssueId);

  const handleIssueSelect = (issue: Issue) => {
    ui.openSpawnModal(issue);
  };

  const handleAgentSelect = (agent: AgentAdapter) => {
    ui.enterAgentView(agent.issueId);
  };

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box borderStyle="single" padding={1}>
        <text>
          <b>Jiratown</b>
        </text>
      </box>

      {/* Chat area */}
      <ChatBox
        messages={messages}
        onSend={send}
        placeholder="Ask a question or type a command..."
      />

      {/* Issues and Agents side by side */}
      <box flexDirection="row" flexGrow={1}>
        <IssueList onSelect={handleIssueSelect} />
        <AgentList onSelect={handleAgentSelect} />
      </box>

      {/* Status bar */}
      <StatusBar
        shortcuts={[
          { key: "Enter", action: "select" },
          { key: "?", action: "help" },
        ]}
      />
    </box>
  );
}
