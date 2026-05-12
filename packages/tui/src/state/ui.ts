import { createSignal } from "solid-js";
import type { Issue } from "@stevenjpx2/jiratown-core";

export type Screen = "overview" | "agent" | "help";
export type Modal = "spawn" | "model" | "delete" | null;

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
const [deleteIssue, setDeleteIssue] = createSignal<Issue | null>(null);

// Model selection state (overrides config when set)
const [selectedModel, setSelectedModel] = createSignal<string | null>(null);

// Input and focus state
const [inputMode, setInputMode] = createSignal(false);
const [focusedComponent, setFocusedComponent] = createSignal<FocusTarget>("issues");

// Toast notification state
export type ToastType = "error" | "success" | "info" | "warning";
export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  timestamp: number;
}
const [toasts, setToasts] = createSignal<Toast[]>([]);
let toastId = 0;

// Focus order for tab navigation
const FOCUS_ORDER: FocusTarget[] = ["issues", "agents", "chat"];

// Track which list (issues or agents) was last focused before entering chat
// This determines whether chat input creates a new issue or messages an agent
const [lastFocusedList, setLastFocusedList] = createSignal<"issues" | "agents">("issues");

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
   * Tracks which list was last focused before entering chat.
   */
  focusNext: () => {
    const current = focusedComponent();
    const next = FOCUS_ORDER[(FOCUS_ORDER.indexOf(current) + 1) % FOCUS_ORDER.length]!;

    // Track the list we're leaving if moving to chat
    if (next === "chat" && (current === "issues" || current === "agents")) {
      setLastFocusedList(current);
    }

    setFocusedComponent(next);
    // Auto-toggle input mode based on what we're focusing
    setInputMode(next === "chat");
  },

  /**
   * Focus the previous component in tab order.
   * Automatically enters input mode when focusing chat.
   * Tracks which list was last focused before entering chat.
   */
  focusPrev: () => {
    const current = focusedComponent();
    const prev =
      FOCUS_ORDER[(FOCUS_ORDER.indexOf(current) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length]!;

    // Track the list we're leaving if moving to chat
    if (prev === "chat" && (current === "issues" || current === "agents")) {
      setLastFocusedList(current);
    }

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

  /** Show a toast notification. Auto-dismisses after duration (default 5s). */
  toast: (type: ToastType, message: string, duration = 5000) => {
    const id = ++toastId;
    const toast: Toast = { id, type, message, timestamp: Date.now() };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => ui.dismissToast(id), duration);
    return id;
  },

  /** Dismiss a toast by ID. */
  dismissToast: (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  },

  /** Shorthand for error toast. */
  showError: (message: string) => ui.toast("error", message, 8000),

  /** Shorthand for success toast. */
  showSuccess: (message: string) => ui.toast("success", message, 3000),
};
