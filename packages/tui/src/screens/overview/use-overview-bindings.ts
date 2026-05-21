import { useKeyboard } from "@opentui/solid";
/**
 * Keybindings for the Overview screen.
 * Handles arrow/vim navigation within lists and Enter to select.
 * Uses useKeyboard directly for simplicity.
 */
import type { Accessor, Setter } from "solid-js";
import type { AgentAdapter, Issue } from "workhorse-core";

import { ui } from "../../state/ui";

interface UseOverviewBindingsOptions {
  issues: Accessor<Issue[]>;
  agents: Accessor<AgentAdapter[]>;
  issueIndex: Accessor<number>;
  setIssueIndex: Setter<number>;
  agentIndex: Accessor<number>;
  setAgentIndex: Setter<number>;
  onIssueSelect: (issue: Issue) => void;
  onAgentSelect: (agent: AgentAdapter) => void;
  onAgentToggle: (agent: AgentAdapter) => void;
  onSpawnAll?: () => void;
}

export function useOverviewBindings(options: UseOverviewBindingsOptions) {
  useKeyboard((key) => {
    // Skip if in input mode, modal is open, or not on overview screen
    if (ui.inputMode() || ui.modal() || ui.screen() !== "overview") return;

    const keyName = key.name;
    const focused = ui.focusedComponent();

    // Left/Right (or h/l): Switch between components
    if (keyName === "left" || keyName === "h") {
      ui.focusPrev();
      return;
    }

    if (keyName === "right" || keyName === "l") {
      ui.focusNext();
      return;
    }

    // Up/Down (or k/j): Navigate within the focused list
    if (keyName === "up" || keyName === "k") {
      if (focused === "issues") {
        const maxIndex = options.issues().length - 1;
        if (maxIndex >= 0) {
          options.setIssueIndex((i) => Math.max(0, i - 1));
        }
      } else if (focused === "agents") {
        const maxIndex = options.agents().length - 1;
        if (maxIndex >= 0) {
          options.setAgentIndex((i) => Math.max(0, i - 1));
        }
      }
      return;
    }

    if (keyName === "down" || keyName === "j") {
      if (focused === "issues") {
        const maxIndex = options.issues().length - 1;
        if (maxIndex >= 0) {
          options.setIssueIndex((i) => Math.min(maxIndex, i + 1));
        }
      } else if (focused === "agents") {
        const maxIndex = options.agents().length - 1;
        if (maxIndex >= 0) {
          options.setAgentIndex((i) => Math.min(maxIndex, i + 1));
        }
      }
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

    // Delete selected issue (d or backspace when issues focused)
    if ((keyName === "d" || keyName === "backspace") && focused === "issues") {
      const issue = options.issues()[options.issueIndex()];
      if (issue) ui.openDeleteModal(issue);
      return;
    }

    // s: toggle agent start/stop (when agents pane is focused)
    if (keyName === "s" && focused === "agents") {
      const agent = options.agents()[options.agentIndex()];
      if (agent) options.onAgentToggle(agent);
      return;
    }

    // a: spawn all issues (when issues pane is focused)
    if (keyName === "a" && focused === "issues" && options.onSpawnAll) {
      options.onSpawnAll();
      return;
    }
  });
}
