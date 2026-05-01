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

    // Navigate up
    if (keyName === "up" || keyName === "k") {
      if (focused === "issues" && options.issues().length > 0) {
        options.setIssueIndex((i) => Math.max(0, i - 1));
      } else if (focused === "agents" && options.agents().length > 0) {
        options.setAgentIndex((i) => Math.max(0, i - 1));
      }
      return;
    }

    // Navigate down
    if (keyName === "down" || keyName === "j") {
      if (focused === "issues" && options.issues().length > 0) {
        options.setIssueIndex((i) => Math.min(options.issues().length - 1, i + 1));
      } else if (focused === "agents" && options.agents().length > 0) {
        options.setAgentIndex((i) => Math.min(options.agents().length - 1, i + 1));
      }
      return;
    }

    // Navigate left (to issues)
    if (keyName === "left" || keyName === "h") {
      ui.setFocusedComponent("issues");
      return;
    }

    // Navigate right (to agents)
    if (keyName === "right" || keyName === "l") {
      ui.setFocusedComponent("agents");
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
