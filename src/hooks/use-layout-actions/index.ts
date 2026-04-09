/**
 * useLayoutActions hook exports
 *
 * Provides centralized action handlers for Layout component,
 * eliminating prop drilling of individual handler functions.
 */

// Types
export type {
  UseLayoutActionsOptions,
  UseLayoutActionsReturn,
} from "./types.ts";

// Main hook
export { useLayoutActions } from "./use-layout-actions.ts";
