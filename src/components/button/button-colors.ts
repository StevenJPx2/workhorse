/**
 * Button color utilities
 *
 * Provides color mappings for button variants and hover states.
 */

import { colors } from "../../lib/theme/index.ts";
import type { ButtonProps } from "./button.tsx";

/**
 * Get the color for a button variant
 */
export function getVariantColor(variant: ButtonProps["variant"]): string {
  switch (variant) {
    case "primary":
      return colors.primary;
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.error;
    default:
      return colors.text.secondary;
  }
}

/**
 * Get the bright hover color for a button variant
 */
export function getVariantBrightColor(variant: ButtonProps["variant"]): string {
  switch (variant) {
    case "primary":
      return colors.infoBright; // Use info bright since primary doesn't have a bright variant
    case "success":
      return colors.successBright;
    case "warning":
      return colors.warningBright;
    case "danger":
      return colors.errorBright;
    default:
      return colors.text.primary;
  }
}
