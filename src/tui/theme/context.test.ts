/**
 * Tests for theme context utilities
 */

import { describe, expect, it } from "bun:test";
import { colors } from "./colors.ts";
import { gruvbox } from "./gruvbox.ts";
import type { ThemeName, Theme } from "./types.ts";

// Build themes registry locally to avoid importing context.tsx (which has JSX)
const themes: Record<ThemeName, Theme> = {
  default: colors,
  gruvbox: gruvbox,
};

// Test getTheme functionality directly from themes registry
// (avoiding JSX/component tests which require special setup)

describe("theme context utilities", () => {
  describe("themes registry", () => {
    it("should have default theme", () => {
      expect(themes.default).toBeDefined();
    });

    it("should have gruvbox theme", () => {
      expect(themes.gruvbox).toBeDefined();
    });

    it("should return different themes for different names", () => {
      expect(themes.default).not.toBe(themes.gruvbox);
    });

    it("should return theme with correct structure", () => {
      const theme = themes.default;

      // Check all expected properties exist
      expect(theme.primary).toBeDefined();
      expect(theme.bg.base).toBeDefined();
      expect(theme.text.primary).toBeDefined();
      expect(theme.border.default).toBeDefined();
      expect(theme.status.done).toBeDefined();
      expect(theme.agent.opencode).toBeDefined();
    });
  });

  describe("theme values", () => {
    it("default theme should have correct primary color", () => {
      expect(themes.default.primary).toBe("#00BFFF");
    });

    it("gruvbox theme should have correct primary color", () => {
      expect(themes.gruvbox.primary).toBe("#8ec07c");
    });

    it("themes should have different background colors", () => {
      expect(themes.default.bg.base).not.toBe(themes.gruvbox.bg.base);
      expect(themes.default.bg.shell).not.toBe(themes.gruvbox.bg.shell);
    });
  });

  describe("theme name type", () => {
    it("should accept valid theme names", () => {
      const validNames: ThemeName[] = ["default", "gruvbox"];
      validNames.forEach((name) => {
        expect(themes[name]).toBeDefined();
      });
    });
  });
});
