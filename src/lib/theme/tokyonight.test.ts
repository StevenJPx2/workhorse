/**
 * Tests for Tokyo Night theme
 */

import { describe, expect, it } from "bun:test";
import { tokyonight, tokyonightPalette } from "./tokyonight.ts";

describe("tokyonight theme", () => {
  it("should export tokyonight theme object", () => {
    expect(tokyonight).toBeDefined();
    expect(typeof tokyonight).toBe("object");
  });

  it("should export tokyonightPalette", () => {
    expect(tokyonightPalette).toBeDefined();
    expect(typeof tokyonightPalette).toBe("object");
  });

  describe("primary colors", () => {
    it("should have primary color", () => {
      expect(tokyonight.primary).toBe("#7aa2f7");
    });

    it("should have primaryDim color", () => {
      expect(tokyonight.primaryDim).toBe("#3d59a1");
    });

    it("should have secondary color", () => {
      expect(tokyonight.secondary).toBe("#bb9af7");
    });
  });

  describe("background colors", () => {
    it("should have shell background", () => {
      expect(tokyonight.bg.shell).toBe("#16161e");
    });

    it("should have base background", () => {
      expect(tokyonight.bg.base).toBe("#1a1b26");
    });

    it("should have elevated background", () => {
      expect(tokyonight.bg.elevated).toBeDefined();
    });

    it("should have highlight background", () => {
      expect(tokyonight.bg.highlight).toBe("#292e42");
    });

    it("should have input background", () => {
      expect(tokyonight.bg.input).toBeDefined();
    });
  });

  describe("text colors", () => {
    it("should have primary text", () => {
      expect(tokyonight.text.primary).toBe("#c0caf5");
    });

    it("should have secondary text", () => {
      expect(tokyonight.text.secondary).toBe("#a9b1d6");
    });

    it("should have dim text", () => {
      expect(tokyonight.text.dim).toBe("#565f89");
    });

    it("should have inverse text", () => {
      expect(tokyonight.text.inverse).toBeDefined();
    });
  });

  describe("border colors", () => {
    it("should have default border", () => {
      expect(tokyonight.border.default).toBe("#3b4261");
    });

    it("should have focus border", () => {
      expect(tokyonight.border.focus).toBe("#27a1b9");
    });

    it("should have dim border", () => {
      expect(tokyonight.border.dim).toBeDefined();
    });
  });

  describe("status colors", () => {
    it("should have all status colors", () => {
      expect(tokyonight.status.pending).toBeDefined();
      expect(tokyonight.status.queued).toBeDefined();
      expect(tokyonight.status.planning).toBeDefined();
      expect(tokyonight.status.implementing).toBeDefined();
      expect(tokyonight.status.blocked).toBeDefined();
      expect(tokyonight.status.pr_created).toBeDefined();
      expect(tokyonight.status.in_review).toBeDefined();
      expect(tokyonight.status.done).toBeDefined();
    });
  });

  describe("semantic colors", () => {
    it("should have success colors", () => {
      expect(tokyonight.success).toBeDefined();
      expect(tokyonight.successBright).toBeDefined();
    });

    it("should have warning colors", () => {
      expect(tokyonight.warning).toBe("#e0af68");
      expect(tokyonight.warningBright).toBe("#ff9e64");
    });

    it("should have error colors", () => {
      expect(tokyonight.error).toBe("#db4b4b");
      expect(tokyonight.errorBright).toBe("#f7768e");
    });

    it("should have info colors", () => {
      expect(tokyonight.info).toBeDefined();
      expect(tokyonight.infoBright).toBeDefined();
    });
  });

  describe("agent colors", () => {
    it("should have opencode agent color", () => {
      expect(tokyonight.agent.opencode).toBe("#7dcfff");
    });

    it("should have claude agent color", () => {
      expect(tokyonight.agent.claude).toBe("#ff9e64");
    });
  });

  describe("raw palette", () => {
    it("should have Tokyo Night specific colors", () => {
      expect(tokyonightPalette.blue).toBe("#7aa2f7");
      expect(tokyonightPalette.green).toBe("#9ece6a");
      expect(tokyonightPalette.red).toBe("#f7768e");
      expect(tokyonightPalette.yellow).toBe("#e0af68");
      expect(tokyonightPalette.magenta).toBe("#bb9af7");
      expect(tokyonightPalette.cyan).toBe("#7dcfff");
    });
  });
});
