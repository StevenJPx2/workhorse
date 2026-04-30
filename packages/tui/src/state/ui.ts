import { createSignal } from "solid-js";
import type { Issue } from "@jiratown/core";

export type Screen = "overview" | "agent" | "help";
export type Modal = "spawn" | null;

// Global UI state signals
const [screen, setScreen] = createSignal<Screen>("overview");
const [modal, setModal] = createSignal<Modal>(null);
const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(null);
const [spawnIssue, setSpawnIssue] = createSignal<Issue | null>(null);

/**
 * Global UI state manager using Solid signals.
 */
export const ui = {
  // Accessors (read)
  screen,
  modal,
  selectedAgentId,
  spawnIssue,

  // Actions (write)
  setScreen,

  /**
   * Open the spawn modal for a specific issue.
   */
  openSpawnModal: (issue: Issue) => {
    setSpawnIssue(issue);
    setModal("spawn");
  },

  /**
   * Close any open modal.
   */
  closeModal: () => {
    setModal(null);
    setSpawnIssue(null);
  },

  /**
   * Navigate to the agent dashboard for a specific agent.
   */
  enterAgentView: (agentId: string) => {
    setSelectedAgentId(agentId);
    setScreen("agent");
  },

  /**
   * Return to the overview screen.
   */
  backToOverview: () => {
    setScreen("overview");
  },
};
