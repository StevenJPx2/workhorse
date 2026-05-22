import { createSignal } from "solid-js";
import type { Issue } from "workhorse-core";

import {
  type FocusTarget,
  enterInputMode,
  exitInputMode,
  focusNext,
  focusPrev,
  focusedComponent,
  inputMode,
  isFocused,
  setFocusedComponent,
  setInputMode,
} from "./focus.ts";
import {
  type Toast,
  type ToastType,
  dismissToast,
  showError,
  showSuccess,
  toast,
  toasts,
} from "./toast.ts";

export type { Toast, ToastType, FocusTarget };
export type Screen = "overview" | "agent" | "help";
export type Modal = "spawn" | "spawn-all" | "model" | "delete" | null;

// Global UI state signals
const [screen, setScreen] = createSignal<Screen>("overview");
const [modal, setModal] = createSignal<Modal>(null);
const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(null);
const [spawnIssue, setSpawnIssue] = createSignal<Issue | null>(null);
const [spawnAllIssues, setSpawnAllIssues] = createSignal<Issue[]>([]);
const [deleteIssue, setDeleteIssue] = createSignal<Issue | null>(null);

// Model selection state (overrides config when set)
const [selectedModel, setSelectedModel] = createSignal<string | null>(null);

// Shutdown state - true while gracefully shutting down
const [shuttingDown, setShuttingDown] = createSignal(false);

// Spawning state - tracks issues that are currently being spawned
// Maps issueId -> Issue for showing loading state in agent view
const [spawningIssues, setSpawningIssues] = createSignal<Map<string, Issue>>(
  new Map(),
);

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
  spawnAllIssues,
  deleteIssue,
  inputMode,
  focusedComponent,
  selectedModel,
  toasts,
  shuttingDown,
  spawningIssues,

  /** Check if an issue is currently being spawned */
  isSpawning: (issueId: string) => spawningIssues().has(issueId),

  /** Get the issue being spawned (for loading state display) */
  getSpawningIssue: (issueId: string) => spawningIssues().get(issueId) ?? null,

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
    setSpawnAllIssues([]);
    setDeleteIssue(null);
  },

  /**
   * Open the spawn-all modal for multiple issues.
   */
  openSpawnAllModal: (issues: Issue[]) => {
    setSpawnAllIssues(issues);
    setModal("spawn-all");
    setInputMode(false);
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
   * Mark an issue as spawning (for loading state in agent view).
   */
  startSpawning: (issue: Issue) => {
    setSpawningIssues((prev) => new Map(prev).set(issue.externalId, issue));
  },

  /**
   * Clear spawning state for an issue (spawn completed or failed).
   */
  stopSpawning: (issueId: string) => {
    setSpawningIssues((prev) => {
      const next = new Map(prev);
      next.delete(issueId);
      return next;
    });
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

  /** Set the shutdown callback. Called from index.tsx after bootstrap. */
  setShutdownCallback: (callback: () => Promise<void>) => {
    shutdownCallback = callback;
  },

  /**
   * Gracefully shutdown the app (stop all agents, cleanup resources).
   * Returns a promise that resolves when shutdown is complete.
   */
  shutdown: async () => {
    if (shuttingDown()) return; // Prevent double shutdown
    setShuttingDown(true);
    if (shutdownCallback) {
      await shutdownCallback();
    }
  },
};
