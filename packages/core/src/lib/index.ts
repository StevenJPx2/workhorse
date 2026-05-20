/**
 * Core library utilities
 * @module lib
 */

// Fuzzy search
export {
  createFuzzySearcher,
  FuzzySearcher,
  type FuzzySearchItem,
  type FuzzySearchOptions,
} from "./fuzzy-search";

// Git utilities
export { createWorktree, getGitRoot, removeWorktree, syncWorktree } from "./git";

// Hooks
export {
  deferredHooks,
  hooks,
  generateHooksReference,
  type HookEmitter,
  type HookEventMap,
  type HookEventName,
  type HookCallbacks,
  type HookPayload,
} from "./hooks";

// Metadata footer
export {
  isWorkhorseGenerated,
  withWorkhorseFooter,
  METADATA_FOOTER,
  WORKHORSE_MARKER,
} from "./metadata-footer";

// Paths
export {
  validatePath,
  isPathAllowed,
  assertPathAllowed,
  createPathValidator,
  type PathValidationOptions,
  type PathValidationResult,
  type PathValidator,
} from "./paths";
