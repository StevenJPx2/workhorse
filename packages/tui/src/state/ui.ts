import { createSignal } from "solid-js";
import type { Issue } from "@jiratown/core";

export type Screen = "overview" | "agent" | "help";
export type Modal = "spawn" | null;

/**
 * Focus targets for tab navigation.
 * Each represents a focusable region in the UI.
 */
export type FocusTarget = "issues" | "agents" | "chat";

// Global UI state signals
const [screen, setScreen] = createSignal<Screen>("overview");
const [modal, setModal] = createSignal<Modal>(null);
const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(null);
const [spawnIssue, setSpawnIssue] = createSignal<Issue | null>(null);

// Input and focus state
const [inputMode, setInputMode] = createSignal(false);
const [focusedComponent, setFocusedComponent] = createSignal<FocusTarget>("issues");

// Focus order for tab navigation
const FOCUS_ORDER: FocusTarget[] = ["issues", "agents", "chat"];

/**
 * Global UI state manager using Solid signals.
 */
export const ui = {
  // Accessors (read)
  screen,
  modal,
  selectedAgentId,
  spawnIssue,
  inputMode,
  focusedComponent,

  // Actions (write)
  setScreen,
  setInputMode,
  setFocusedComponent,

  /**
   * Enter input mode (blocks global shortcuts).
   */
  enterInputMode: () => {
    setInputMode(true);
  },

  /**
   * Exit input mode (re-enables global shortcuts).
   */
  exitInputMode: () => {
    setInputMode(false);
  },

  /**
   * Focus the next component in tab order.
   * Automatically enters input mode when focusing chat.
   */
  focusNext: () => {
    const current = focusedComponent();
    const idx = FOCUS_ORDER.indexOf(current);
    const next = FOCUS_ORDER[(idx + 1) % FOCUS_ORDER.length]!;
    setFocusedComponent(next);
    // Auto-toggle input mode based on what we're focusing
    setInputMode(next === "chat");
  },

  /**
   * Focus the previous component in tab order.
   * Automatically enters input mode when focusing chat.
   */
  focusPrev: () => {
    const current = focusedComponent();
    const idx = FOCUS_ORDER.indexOf(current);
    const prev = FOCUS_ORDER[(idx - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length]!;
    setFocusedComponent(prev);
    // Auto-toggle input mode based on what we're focusing
    setInputMode(prev === "chat");
  },

  /**
   * Check if a component is currently focused.
   */
  isFocused: (target: FocusTarget) => focusedComponent() === target,

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
    setFocusedComponent("chat");
  },

  /**
   * Return to the overview screen.
   */
  backToOverview: () => {
    setScreen("overview");
  },
};
