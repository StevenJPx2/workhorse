/**
 * useCommandFilter hook exports
 */

export {
  useCommandFilter,
  type UseCommandFilterOptions,
  type UseCommandFilterReturn,
} from "./use-command-filter.ts";

// Re-export from core for backward compatibility
export { fuzzyMatch, fuzzyFilter, type FuzzyMatch } from "#core/utils/index.ts";
