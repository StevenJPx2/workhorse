/**
 * Keybindings for the Overview screen.
 * Handles arrow/vim navigation within lists and Enter to select.
 */
import type { Accessor, Setter } from "solid-js";
import type { AgentAdapter, Issue } from "@jiratown/core";
import { useBindings, reactiveMatcherFromSignal } from "@opentui/keymap/solid";
import { Commands } from "../../keymap.ts";
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
  const canNavigate = () => !ui.inputMode() && !ui.modal();

  useBindings(() => ({
    commands: [
      {
        name: Commands.NAVIGATE_UP,
        run: () => {
          const focused = ui.focusedComponent();
          if (focused === "issues" && options.issues().length > 0) {
            options.setIssueIndex((i) => Math.max(0, i - 1));
          } else if (focused === "agents" && options.agents().length > 0) {
            options.setAgentIndex((i) => Math.max(0, i - 1));
          }
        },
      },
      {
        name: Commands.NAVIGATE_DOWN,
        run: () => {
          const focused = ui.focusedComponent();
          if (focused === "issues" && options.issues().length > 0) {
            options.setIssueIndex((i) => Math.min(options.issues().length - 1, i + 1));
          } else if (focused === "agents" && options.agents().length > 0) {
            options.setAgentIndex((i) => Math.min(options.agents().length - 1, i + 1));
          }
        },
      },
      {
        name: Commands.SELECT,
        run: () => {
          const focused = ui.focusedComponent();
          if (focused === "issues") {
            const issue = options.issues()[options.issueIndex()];
            if (issue) options.onIssueSelect(issue);
          } else if (focused === "agents") {
            const agent = options.agents()[options.agentIndex()];
            if (agent) options.onAgentSelect(agent);
          } else if (focused === "chat") {
            ui.enterInputMode();
          }
        },
      },
    ],
    bindings: [
      {
        key: "up",
        cmd: Commands.NAVIGATE_UP,
        enabled: reactiveMatcherFromSignal(canNavigate, (v) => v),
      },
      {
        key: "k",
        cmd: Commands.NAVIGATE_UP,
        enabled: reactiveMatcherFromSignal(canNavigate, (v) => v),
      },
      {
        key: "down",
        cmd: Commands.NAVIGATE_DOWN,
        enabled: reactiveMatcherFromSignal(canNavigate, (v) => v),
      },
      {
        key: "j",
        cmd: Commands.NAVIGATE_DOWN,
        enabled: reactiveMatcherFromSignal(canNavigate, (v) => v),
      },
      {
        key: "return",
        cmd: Commands.SELECT,
        enabled: reactiveMatcherFromSignal(canNavigate, (v) => v),
      },
    ],
  }));
}
