/**
 * Tests for button-colors utility functions
 */

import { describe, it, expect } from "bun:test";
import { getVariantColor, getVariantBrightColor, getVariantDimColor } from "./button-colors.ts";
import type { Theme } from "../../theme/types.ts";

// Minimal theme mock
const mockTheme = {
  primary: "#7c6f64",
  primaryBright: "#fe8019",
  primaryDim: "#a89984",
  success: "#b8bb26",
  successBright: "#d5c4a1",
  warning: "#fabd2f",
  warningBright: "#ffd75f",
  error: "#fb4934",
  errorBright: "#ff6b5b",
  text: {
    primary: "#ebdbb2",
    secondary: "#a89984",
    dim: "#7c6f64",
  },
} as unknown as Theme;

describe("button-colors", () => {
  describe("getVariantColor", () => {
    it("should return primary color for primary variant", () => {
      expect(getVariantColor("primary", mockTheme)).toBe(mockTheme.primary);
    });

    it("should return success color for success variant", () => {
      expect(getVariantColor("success", mockTheme)).toBe(mockTheme.success);
    });

    it("should return warning color for warning variant", () => {
      expect(getVariantColor("warning", mockTheme)).toBe(mockTheme.warning);
    });

    it("should return error color for danger variant", () => {
      expect(getVariantColor("danger", mockTheme)).toBe(mockTheme.error);
    });

    it("should return secondary text color for undefined variant", () => {
      expect(getVariantColor(undefined, mockTheme)).toBe(mockTheme.text.secondary);
    });

    it("should return secondary text color for unknown variant", () => {
      expect(getVariantColor("ghost" as any, mockTheme)).toBe(mockTheme.text.secondary);
    });
  });

  describe("getVariantBrightColor", () => {
    it("should return primaryBright for primary variant", () => {
      expect(getVariantBrightColor("primary", mockTheme)).toBe(mockTheme.primaryBright);
    });

    it("should return successBright for success variant", () => {
      expect(getVariantBrightColor("success", mockTheme)).toBe(mockTheme.successBright);
    });

    it("should return warningBright for warning variant", () => {
      expect(getVariantBrightColor("warning", mockTheme)).toBe(mockTheme.warningBright);
    });

    it("should return errorBright for danger variant", () => {
      expect(getVariantBrightColor("danger", mockTheme)).toBe(mockTheme.errorBright);
    });

    it("should return primary text for undefined variant", () => {
      expect(getVariantBrightColor(undefined, mockTheme)).toBe(mockTheme.text.primary);
    });
  });

  describe("getVariantDimColor", () => {
    it("should return primaryDim for primary variant", () => {
      expect(getVariantDimColor("primary", mockTheme)).toBe(mockTheme.primaryDim);
    });

    it("should return success color for success variant", () => {
      expect(getVariantDimColor("success", mockTheme)).toBe(mockTheme.success);
    });

    it("should return warning color for warning variant", () => {
      expect(getVariantDimColor("warning", mockTheme)).toBe(mockTheme.warning);
    });

    it("should return error color for danger variant", () => {
      expect(getVariantDimColor("danger", mockTheme)).toBe(mockTheme.error);
    });

    it("should return dim text for undefined variant", () => {
      expect(getVariantDimColor(undefined, mockTheme)).toBe(mockTheme.text.dim);
    });
  });
});
