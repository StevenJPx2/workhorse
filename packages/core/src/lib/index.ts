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
} from "./fuzzy-search.ts";

// Git utilities
export { createWorktree, getGitRoot, removeWorktree, syncWorktree } from "./git/index.ts";

// Hooks - re-export everything
export {
  deferredHooks,
  hooks,
  generateHooksMarkdown,
  generateHooksReference,
  registerHookMetadata,
  clearPluginHookMetadata,
  getAllHookMetadata,
  CORE_HOOK_METADATA,
  type DiscoveredLink,
  type HookCallbacks,
  type HookEmitter,
  type HookEventMap,
  type HookEventName,
  type HookMetadata,
  type HookPayload,
  type PromptBuildingContext,
  type PromptContextBlock,
} from "./hooks/index.ts";

// Metadata footer
export {
  isWorkhorseGenerated,
  withWorkhorseFooter,
  METADATA_FOOTER,
  WORKHORSE_MARKER,
} from "./metadata-footer.ts";

// Paths
export {
  validatePath,
  isPathAllowed,
  assertPathAllowed,
  createPathValidator,
  type PathValidationOptions,
  type PathValidationResult,
  type PathValidator,
} from "./paths/index.ts";
