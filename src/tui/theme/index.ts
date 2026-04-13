/**
 * Theme exports for Jiratown TUI
 */

import { colors as defaultColors } from "./colors.ts";
import { gruvbox as gruvboxColors } from "./gruvbox.ts";
import { tokyonight as tokyonightColors } from "./tokyonight.ts";
import type { Theme, ThemeName } from "./types.ts";

export { colors } from "./colors.ts";
export { gruvbox, gruvboxPalette } from "./gruvbox.ts";
export { tokyonight, tokyonightPalette } from "./tokyonight.ts";
export {
  statusConfig,
  getStatusConfig,
  getAgentStateConfig,
  type StatusConfig,
  type AgentStateConfig,
} from "./status.ts";
export { spacing, borderStyles, presets } from "./presets.ts";
export { getAgentColor, formatKeyHint, createDivider } from "./utils.ts";
export type { Theme, ThemeName } from "./types.ts";

// Theme context exports
export {
  ThemeProvider,
  useTheme,
  getTheme,
  type ThemeContextValue,
  type ThemeProviderProps,
} from "./context.tsx";

// Theme registry
export const themes: Record<ThemeName, Theme> = {
  tokyonight: tokyonightColors,
  gruvbox: gruvboxColors,
  default: defaultColors,
};
