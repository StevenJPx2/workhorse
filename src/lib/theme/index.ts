/**
 * Theme exports for Jiratown TUI
 */

import { colors as defaultColors } from "./colors.ts";
import { gruvbox as gruvboxColors } from "./gruvbox.ts";
import type { Theme, ThemeName } from "./types.ts";

export { colors } from "./colors.ts";
export { gruvbox, gruvboxPalette } from "./gruvbox.ts";
export { statusConfig, getStatusConfig, type StatusConfig } from "./status.ts";
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
  default: defaultColors,
  gruvbox: gruvboxColors,
};
