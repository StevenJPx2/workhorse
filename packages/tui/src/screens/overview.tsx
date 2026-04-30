import { createSignal } from "solid-js";
import type { Issue, AgentAdapter } from "@jiratown/core";
import { IssueList, AgentList, StatusBar } from "../components";
import { createChat } from "../primitives";
import { ui } from "../state/ui.ts";

/**
 * Overview screen - main landing page with centered chat input.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │                                             │
 * │  ISSUES (dimmed)    │  AGENTS (dimmed)      │
 * │  ▸ AM-123 Fix...    │  ▸ AM-456 ● running   │
 * │                     │                       │
 * │        ┌─────────────────────────┐          │
 * │        │ > Ask or type command...│          │
 * │        └─────────────────────────┘          │
 * │                                             │
 * ├─────────────────────────────────────────────┤
 * │ [Enter]select  [?]help               q:quit │
 * └─────────────────────────────────────────────┘
 */
export function Overview() {
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
    <box flexDirection="column" width="100%" height="100%">
      {/* Main content area - issues/agents dimmed in background with floating input */}
      <box flexDirection="column" flexGrow={1} position="relative">
        {/* Background: Issues and Agents side by side */}
        <box flexDirection="row" flexGrow={1}>
          <IssueList onSelect={handleIssueSelect} />
          <AgentList onSelect={handleAgentSelect} />
        </box>

        {/* Floating centered chat input */}
        <box position="absolute" top="50%" left="50%" marginTop={-2} marginLeft={-20} width={40}>
          <box borderStyle="rounded" padding={1}>
            <input
              value={input()}
              onInput={(e) => setInput(e)}
              onSubmit={handleSubmit}
              placeholder="Ask or type a command..."
            />
          </box>
        </box>
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
