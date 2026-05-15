import { createSignal } from "solid-js";
import type { Issue } from "workhorse-core";
import {
  toast,
  dismissToast,
  showError,
  showSuccess,
  toasts,
  type Toast,
  type ToastType,
} from "./ui-toast.ts";
import {
  inputMode,
  setInputMode,
  focusedComponent,
  setFocusedComponent,
  lastFocusedList,
  enterInputMode,
  exitInputMode,
  focusNext,
  focusPrev,
  isFocused,
  resetChatContext,
  type FocusTarget,
} from "./ui-focus.ts";

export type { Toast, ToastType, FocusTarget };
export type Screen = "overview" | "agent" | "help";
export type Modal = "spawn" | "model" | "delete" | null;

// Global UI state signals
const [screen, setScreen] = createSignal<Screen>("overview");
const [modal, setModal] = createSignal<Modal>(null);
const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(null);
const [spawnIssue, setSpawnIssue] = createSignal<Issue | null>(null);
const [deleteIssue, setDeleteIssue] = createSignal<Issue | null>(null);

// Model selection state (overrides config when set)
const [selectedModel, setSelectedModel] = createSignal<string | null>(null);

// Shutdown callback - set by index.tsx, called on quit
let shutdownCallback: (() => Promise<void>) | null = null;

/**
 * Global UI state manager using Solid signals.
 */
export const ui = {
  // Accessors (read)
  screen,
  modal,
  selectedAgentId,
  spawnIssue,
  deleteIssue,
  inputMode,
  focusedComponent,
  selectedModel,
  toasts,
  lastFocusedList,

  // Actions (write)
  setScreen,
  setInputMode,
  setFocusedComponent,
  setSelectedModel,

  enterInputMode,
  exitInputMode,
  focusNext,
  focusPrev,
  isFocused,
  resetChatContext,

  /**
   * Open the spawn modal for a specific issue.
   * Exits input mode so the modal's keyboard handler can capture Enter.
   */
  openSpawnModal: (issue: Issue) => {
    setSpawnIssue(issue);
    setModal("spawn");
    setInputMode(false);
  },

  /**
   * Close any open modal.
   */
  closeModal: () => {
    setModal(null);
    setSpawnIssue(null);
    setDeleteIssue(null);
  },

  /**
   * Open the delete confirmation modal for a specific issue.
   */
  openDeleteModal: (issue: Issue) => {
    setDeleteIssue(issue);
    setModal("delete");
  },

  /**
   * Open the model selection modal.
   */
  openModelModal: () => {
    setModal("model");
  },

  /**
   * Navigate to the agent dashboard for a specific agent.
   */
  enterAgentView: (agentId: string) => {
    setSelectedAgentId(agentId);
    setScreen("agent");
    setFocusedComponent("chat");
    setInputMode(true);
  },

  /**
   * Return to the overview screen.
   */
  backToOverview: () => {
    setScreen("overview");
  },

  toast,
  dismissToast,
  showError,
  showSuccess,

  /**
   * Set the shutdown callback. Called from index.tsx after bootstrap.
   */
  setShutdownCallback: (callback: () => Promise<void>) => {
    shutdownCallback = callback;
  },

  /**
   * Gracefully shutdown the app (stop all agents, cleanup resources).
   * Returns a promise that resolves when shutdown is complete.
   */
  shutdown: async () => {
    if (shutdownCallback) {
      await shutdownCallback();
    }
  },
};
