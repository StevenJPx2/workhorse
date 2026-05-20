/**
 * Keybindings for the Agent screen.
 * Handles j/k/up/down navigation in the sidebar when not in input mode.
 * Uses useKeyboard directly for simplicity.
 */
import { useKeyboard } from "@opentui/solid";
import type { Accessor, Setter } from "solid-js";
import type { AgentAdapter } from "workhorse-core";

import { ui } from "../../state/ui";

interface UseAgentBindingsOptions {
  agents: Accessor<AgentAdapter[]>;
  sidebarIndex: Accessor<number>;
  setSidebarIndex: Setter<number>;
  onAgentSelect: (agent: AgentAdapter) => void;
}

export function useAgentBindings(options: UseAgentBindingsOptions) {
  useKeyboard((key) => {
    // Skip if in input mode, modal is open, or not on agent screen
    if (ui.inputMode() || ui.modal() || ui.screen() !== "agent") return;

    const keyName = key.name;
    const maxIndex = options.agents().length - 1;

    // Up/k: Move up in sidebar
    if (keyName === "up" || keyName === "k") {
      if (maxIndex >= 0) options.setSidebarIndex((i) => Math.max(0, i - 1));
      return;
    }

    // Down/j: Move down in sidebar
    if (keyName === "down" || keyName === "j") {
      if (maxIndex >= 0) options.setSidebarIndex((i) => Math.min(maxIndex, i + 1));
      return;
    }

    // Enter: Select the highlighted agent
    if (keyName === "return") {
      const agent = options.agents()[options.sidebarIndex()];
      if (agent) options.onAgentSelect(agent);
    }
  });
}
