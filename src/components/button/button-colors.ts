/**
 * Button color utilities
 *
 * Provides color mappings for button variants and hover states.
 */

import type { Theme } from "../../lib/theme/types.ts";
import type { ButtonProps } from "./button.tsx";

/**
 * Get the color for a button variant
 */
export function getVariantColor(
  variant: ButtonProps["variant"],
  theme: Theme
): string {
  switch (variant) {
    case "primary":
      return theme.primary;
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    case "danger":
      return theme.error;
    default:
      return theme.text.secondary;
  }
}

/**
 * Get the bright hover color for a button variant
 */
export function getVariantBrightColor(
  variant: ButtonProps["variant"],
  theme: Theme
): string {
  switch (variant) {
    case "primary":
      return theme.infoBright; // Use info bright since primary doesn't have a bright variant
    case "success":
      return theme.successBright;
    case "warning":
      return theme.warningBright;
    case "danger":
      return theme.errorBright;
    default:
      return theme.text.primary;
  }
}
