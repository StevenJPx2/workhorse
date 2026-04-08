/**
 * Tests for command types
 */

import { describe, expect, it } from "bun:test";
import {
  isActionCommand,
  isSubmenuCommand,
  type ActionCommand,
  type SubmenuCommand,
} from "./types.ts";

describe("command type guards", () => {
  const actionCommand: ActionCommand = {
    id: "test-action",
    label: "Test Action",
    type: "action",
    action: () => {},
  };

  const submenuCommand: SubmenuCommand = {
    id: "test-submenu",
    label: "Test Submenu",
    type: "submenu",
    items: [{ id: "item-1", label: "Item 1", action: () => {} }],
  };

  describe("isActionCommand", () => {
    it("should return true for action commands", () => {
      expect(isActionCommand(actionCommand)).toBe(true);
    });

    it("should return false for submenu commands", () => {
      expect(isActionCommand(submenuCommand)).toBe(false);
    });
  });

  describe("isSubmenuCommand", () => {
    it("should return true for submenu commands", () => {
      expect(isSubmenuCommand(submenuCommand)).toBe(true);
    });

    it("should return false for action commands", () => {
      expect(isSubmenuCommand(actionCommand)).toBe(false);
    });
  });
});
