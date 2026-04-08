/**
 * Hooks exports for Jiratown TUI
 */

// UI State Hooks
export {
  useInteractive,
  type UseInteractiveOptions,
  type UseInteractiveReturn,
  type InteractiveProps,
} from "./use-interactive/index.ts";

export {
  useModal,
  type UseModalOptions,
  type UseModalReturn,
} from "./use-modal/index.ts";

export {
  useFocusZone,
  createFocusZoneManager,
  type FocusZoneId,
  type UseFocusZoneOptions,
  type UseFocusZoneReturn,
  type FocusZoneManager,
} from "./use-focus-zone/index.ts";

export {
  useSelection,
  type UseSelectionOptions,
  type UseSelectionReturn,
} from "./use-selection/index.ts";

export {
  useHotkeys,
  createHotkeyManager,
  parseCombo,
  matchesCombo,
  type HotkeyCombo,
  type HotkeyHandler,
  type Hotkey,
  type HotkeyContext,
  type UseHotkeysOptions,
  type UseHotkeysReturn,
  type KeyInfo,
  type HotkeyManager,
} from "./use-hotkeys/index.ts";

// Data Hooks
export {
  useDatabase,
  type DatabaseStatus,
  type UseDatabaseOptions,
  type UseDatabaseReturn,
} from "./use-database/index.ts";

export {
  useConfig,
  type ConfigStatus,
  type UseConfigOptions,
  type UseConfigReturn,
} from "./use-config/index.ts";

export {
  useTickets,
  type UseTicketsOptions,
  type UseTicketsReturn,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "./use-tickets/index.ts";

// Feature Hooks
export {
  useCommandFilter,
  type UseCommandFilterOptions,
  type UseCommandFilterReturn,
  fuzzyMatch,
  fuzzyFilter,
  type FuzzyMatch,
} from "./use-command-filter/index.ts";

export {
  useCommandPalette,
  type UseCommandPaletteOptions,
  type UseCommandPaletteReturn,
} from "./use-command-palette/index.ts";

// Integration Hooks
export {
  useAtlassian,
  AtlassianClient,
  createAtlassianClient,
  type UseAtlassianOptions,
  type UseAtlassianReturn,
  type JiraIssue,
} from "./use-atlassian/index.ts";

export {
  useTmux,
  type UseTmuxOptions,
  type UseTmuxReturn,
} from "./use-tmux/index.ts";

export {
  useWorktree,
  type UseWorktreeOptions,
  type UseWorktreeReturn,
} from "./use-worktree/index.ts";

export {
  useAgent,
  type UseAgentOptions,
  type UseAgentReturn,
  type SpawnOptions,
} from "./use-agent/index.ts";

export {
  useTicketWorkflow,
  type UseTicketWorkflowOptions,
  type UseTicketWorkflowReturn,
  type StartWorkOptions,
} from "./use-ticket-workflow/index.ts";

export {
  useNotifications,
  type UseNotificationsOptions,
  type UseNotificationsReturn,
  type Notification,
  type CreateNotificationInput,
  type NotificationPriority,
} from "./use-notifications/index.ts";

// Re-export type for convenience
export type { Accessor } from "solid-js";
