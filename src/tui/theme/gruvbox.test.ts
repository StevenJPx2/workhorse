/**
 * Tests for Gruvbox theme
 */

import { describe, expect, it } from "bun:test";
import { gruvbox, gruvboxPalette } from "./gruvbox.ts";
import { colors } from "./colors.ts";
import type { Theme, ThemeName } from "./types.ts";

// Build themes registry locally to avoid importing context.tsx (which has JSX)
const themes: Record<ThemeName, Theme> = {
  default: colors,
  gruvbox: gruvbox,
};

describe("gruvbox theme", () => {
  describe("gruvboxPalette", () => {
    it("should contain dark background colors", () => {
      expect(gruvboxPalette.dark0_hard).toBe("#1d2021");
      expect(gruvboxPalette.dark0).toBe("#282828");
      expect(gruvboxPalette.dark0_soft).toBe("#32302f");
      expect(gruvboxPalette.dark1).toBe("#3c3836");
      expect(gruvboxPalette.dark2).toBe("#504945");
      expect(gruvboxPalette.dark3).toBe("#665c54");
      expect(gruvboxPalette.dark4).toBe("#7c6f64");
    });

    it("should contain light foreground colors", () => {
      expect(gruvboxPalette.light0_hard).toBe("#f9f5d7");
      expect(gruvboxPalette.light0).toBe("#fbf1c7");
      expect(gruvboxPalette.light0_soft).toBe("#f2e5bc");
      expect(gruvboxPalette.light1).toBe("#ebdbb2");
      expect(gruvboxPalette.light2).toBe("#d5c4a1");
      expect(gruvboxPalette.light3).toBe("#bdae93");
      expect(gruvboxPalette.light4).toBe("#a89984");
    });

    it("should contain bright colors", () => {
      expect(gruvboxPalette.bright_red).toBe("#fb4934");
      expect(gruvboxPalette.bright_green).toBe("#b8bb26");
      expect(gruvboxPalette.bright_yellow).toBe("#fabd2f");
      expect(gruvboxPalette.bright_blue).toBe("#83a598");
      expect(gruvboxPalette.bright_purple).toBe("#d3869b");
      expect(gruvboxPalette.bright_aqua).toBe("#8ec07c");
      expect(gruvboxPalette.bright_orange).toBe("#fe8019");
    });

    it("should contain neutral colors", () => {
      expect(gruvboxPalette.neutral_red).toBe("#cc241d");
      expect(gruvboxPalette.neutral_green).toBe("#98971a");
      expect(gruvboxPalette.neutral_yellow).toBe("#d79921");
      expect(gruvboxPalette.neutral_blue).toBe("#458588");
      expect(gruvboxPalette.neutral_purple).toBe("#b16286");
      expect(gruvboxPalette.neutral_aqua).toBe("#689d6a");
      expect(gruvboxPalette.neutral_orange).toBe("#d65d0e");
    });

    it("should contain faded colors", () => {
      expect(gruvboxPalette.faded_red).toBe("#9d0006");
      expect(gruvboxPalette.faded_green).toBe("#79740e");
      expect(gruvboxPalette.faded_yellow).toBe("#b57614");
      expect(gruvboxPalette.faded_blue).toBe("#076678");
      expect(gruvboxPalette.faded_purple).toBe("#8f3f71");
      expect(gruvboxPalette.faded_aqua).toBe("#427b58");
      expect(gruvboxPalette.faded_orange).toBe("#af3a03");
    });

    it("should contain gray", () => {
      expect(gruvboxPalette.gray).toBe("#928374");
    });
  });

  describe("gruvbox theme structure", () => {
    it("should have the same structure as default colors", () => {
      // Check all top-level keys exist
      const defaultKeys = Object.keys(colors);
      const gruvboxKeys = Object.keys(gruvbox);

      expect(gruvboxKeys.sort()).toEqual(defaultKeys.sort());
    });

    it("should have all background colors", () => {
      expect(gruvbox.bg.shell).toBeDefined();
      expect(gruvbox.bg.base).toBeDefined();
      expect(gruvbox.bg.elevated).toBeDefined();
      expect(gruvbox.bg.highlight).toBeDefined();
      expect(gruvbox.bg.input).toBeDefined();
    });

    it("should have all text colors", () => {
      expect(gruvbox.text.primary).toBeDefined();
      expect(gruvbox.text.secondary).toBeDefined();
      expect(gruvbox.text.dim).toBeDefined();
      expect(gruvbox.text.inverse).toBeDefined();
    });

    it("should have all border colors", () => {
      expect(gruvbox.border.default).toBeDefined();
      expect(gruvbox.border.focus).toBeDefined();
      expect(gruvbox.border.dim).toBeDefined();
    });

    it("should have all status colors", () => {
      expect(gruvbox.status.pending).toBeDefined();
      expect(gruvbox.status.queued).toBeDefined();
      expect(gruvbox.status.planning).toBeDefined();
      expect(gruvbox.status.implementing).toBeDefined();
      expect(gruvbox.status.blocked).toBeDefined();
      expect(gruvbox.status.pr_created).toBeDefined();
      expect(gruvbox.status.in_review).toBeDefined();
      expect(gruvbox.status.done).toBeDefined();
    });

    it("should have all semantic colors", () => {
      expect(gruvbox.success).toBeDefined();
      expect(gruvbox.successBright).toBeDefined();
      expect(gruvbox.warning).toBeDefined();
      expect(gruvbox.warningBright).toBeDefined();
      expect(gruvbox.error).toBeDefined();
      expect(gruvbox.errorBright).toBeDefined();
      expect(gruvbox.info).toBeDefined();
      expect(gruvbox.infoBright).toBeDefined();
    });

    it("should have all agent colors", () => {
      expect(gruvbox.agent.opencode).toBeDefined();
      expect(gruvbox.agent.claude).toBeDefined();
    });

    it("should have primary colors", () => {
      expect(gruvbox.primary).toBeDefined();
      expect(gruvbox.primaryDim).toBeDefined();
      expect(gruvbox.secondary).toBeDefined();
    });
  });

  describe("gruvbox color values", () => {
    it("should use gruvbox dark backgrounds", () => {
      expect(gruvbox.bg.shell).toBe(gruvboxPalette.dark0_hard);
      expect(gruvbox.bg.base).toBe(gruvboxPalette.dark0);
      expect(gruvbox.bg.elevated).toBe(gruvboxPalette.dark1);
      expect(gruvbox.bg.highlight).toBe(gruvboxPalette.dark2);
    });

    it("should use gruvbox light foregrounds for text", () => {
      expect(gruvbox.text.primary).toBe(gruvboxPalette.light1);
      expect(gruvbox.text.secondary).toBe(gruvboxPalette.light4);
      expect(gruvbox.text.dim).toBe(gruvboxPalette.gray);
    });

    it("should use aqua as primary color", () => {
      expect(gruvbox.primary).toBe(gruvboxPalette.bright_aqua);
      expect(gruvbox.primaryDim).toBe(gruvboxPalette.neutral_aqua);
    });

    it("should use appropriate status colors", () => {
      expect(gruvbox.status.blocked).toBe(gruvboxPalette.bright_red);
      expect(gruvbox.status.done).toBe(gruvboxPalette.bright_green);
      expect(gruvbox.status.implementing).toBe(gruvboxPalette.bright_yellow);
    });
  });

  describe("theme registry", () => {
    it("should include gruvbox in themes registry", () => {
      expect(themes.gruvbox).toBeDefined();
      expect(themes.gruvbox).toBe(gruvbox);
    });

    it("should include default theme in registry", () => {
      expect(themes.default).toBeDefined();
      expect(themes.default).toBe(colors);
    });

    it("should have gruvbox satisfy Theme interface", () => {
      // This is a compile-time check, but we can verify at runtime too
      const theme: Theme = gruvbox;
      expect(theme.primary).toBeDefined();
      expect(theme.bg.base).toBeDefined();
      expect(theme.text.primary).toBeDefined();
    });
  });

  describe("color format", () => {
    it("should have valid hex color format for all palette colors", () => {
      const hexColorRegex = /^#[0-9a-f]{6}$/i;

      Object.values(gruvboxPalette).forEach((color) => {
        expect(color).toMatch(hexColorRegex);
      });
    });

    it("should have valid hex color format for all theme colors", () => {
      const hexColorRegex = /^#[0-9a-f]{6}$/i;

      // Check flat colors
      expect(gruvbox.primary).toMatch(hexColorRegex);
      expect(gruvbox.primaryDim).toMatch(hexColorRegex);
      expect(gruvbox.secondary).toMatch(hexColorRegex);
      expect(gruvbox.success).toMatch(hexColorRegex);
      expect(gruvbox.error).toMatch(hexColorRegex);

      // Check nested colors
      Object.values(gruvbox.bg).forEach((color) => {
        expect(color).toMatch(hexColorRegex);
      });
      Object.values(gruvbox.text).forEach((color) => {
        expect(color).toMatch(hexColorRegex);
      });
      Object.values(gruvbox.status).forEach((color) => {
        expect(color).toMatch(hexColorRegex);
      });
    });
  });
});
