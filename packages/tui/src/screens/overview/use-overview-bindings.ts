/**
 * Keybindings for the Overview screen.
 * Handles arrow/vim navigation within lists and Enter to select.
 * Uses useKeyboard directly for simplicity.
 */
import type { Accessor, Setter } from "solid-js";
import type { AgentAdapter, Issue } from "@jiratown/core";
import { useKeyboard } from "@opentui/solid";
import { ui } from "../../state/ui.ts";

interface UseOverviewBindingsOptions {
  issues: Accessor<Issue[]>;
  agents: Accessor<AgentAdapter[]>;
  issueIndex: Accessor<number>;
  setIssueIndex: Setter<number>;
  agentIndex: Accessor<number>;
  setAgentIndex: Setter<number>;
  onIssueSelect: (issue: Issue) => void;
  onAgentSelect: (agent: AgentAdapter) => void;
}

export function useOverviewBindings(options: UseOverviewBindingsOptions) {
  useKeyboard((key) => {
    // Skip if in input mode or modal is open
    if (ui.inputMode() || ui.modal()) return;

    const keyName = key.name;
    const focused = ui.focusedComponent();

    // Arrow keys cycle between components
    // Left/Right: issues <-> agents <-> chat (horizontal feel)
    // Up/Down: also cycle (for convenience)
    if (keyName === "left" || keyName === "h" || keyName === "up" || keyName === "k") {
      ui.focusPrev();
      return;
    }

    if (keyName === "right" || keyName === "l" || keyName === "down" || keyName === "j") {
      ui.focusNext();
      return;
    }

    // Select/Enter
    if (keyName === "return") {
      if (focused === "issues") {
        const issue = options.issues()[options.issueIndex()];
        if (issue) options.onIssueSelect(issue);
      } else if (focused === "agents") {
        const agent = options.agents()[options.agentIndex()];
        if (agent) options.onAgentSelect(agent);
      } else if (focused === "chat") {
        ui.enterInputMode();
      }
      return;
    }
  });
}
