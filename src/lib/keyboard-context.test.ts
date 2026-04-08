/**
 * Tests for keyboard context
 */

import { describe, it, expect } from "bun:test";
import { createKeyboardValue, useKeyboardContext } from "./keyboard-context.ts";

describe("createKeyboardValue", () => {
  describe("initial state", () => {
    it("should start not in input mode", () => {
      const keyboard = createKeyboardValue();

      expect(keyboard.isInputMode()).toBe(false);
    });

    it("should start with null currentInputId", () => {
      const keyboard = createKeyboardValue();

      expect(keyboard.currentInputId()).toBeNull();
    });
  });

  describe("enterInputMode", () => {
    it("should set input mode to true", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("test-input");

      expect(keyboard.isInputMode()).toBe(true);
    });

    it("should set currentInputId", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("test-input");

      expect(keyboard.currentInputId()).toBe("test-input");
    });

    it("should allow switching inputs", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("input-1");
      expect(keyboard.currentInputId()).toBe("input-1");

      keyboard.enterInputMode("input-2");
      expect(keyboard.currentInputId()).toBe("input-2");
    });
  });

  describe("exitInputMode", () => {
    it("should set input mode to false", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("test-input");
      expect(keyboard.isInputMode()).toBe(true);

      keyboard.exitInputMode();
      expect(keyboard.isInputMode()).toBe(false);
    });

    it("should clear currentInputId", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("test-input");
      keyboard.exitInputMode();

      expect(keyboard.currentInputId()).toBeNull();
    });

    it("should be idempotent (can call multiple times)", () => {
      const keyboard = createKeyboardValue();

      keyboard.exitInputMode();
      keyboard.exitInputMode();

      expect(keyboard.isInputMode()).toBe(false);
      expect(keyboard.currentInputId()).toBeNull();
    });
  });

  describe("hasInputFocus", () => {
    it("should return false when not in input mode", () => {
      const keyboard = createKeyboardValue();

      expect(keyboard.hasInputFocus("any-input")).toBe(false);
    });

    it("should return true for the focused input", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("my-input");

      expect(keyboard.hasInputFocus("my-input")).toBe(true);
    });

    it("should return false for other inputs", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("my-input");

      expect(keyboard.hasInputFocus("other-input")).toBe(false);
    });

    it("should return false after exiting input mode", () => {
      const keyboard = createKeyboardValue();

      keyboard.enterInputMode("my-input");
      keyboard.exitInputMode();

      expect(keyboard.hasInputFocus("my-input")).toBe(false);
    });
  });
});

describe("useKeyboardContext", () => {
  it("returns no-op context when not in provider", () => {
    // useKeyboardContext returns fallback when no context
    const keyboard = useKeyboardContext();

    expect(keyboard.isInputMode()).toBe(false);
    expect(keyboard.currentInputId()).toBeNull();

    // Should not throw
    keyboard.enterInputMode("test");
    keyboard.exitInputMode();
    expect(keyboard.hasInputFocus("test")).toBe(false);
  });
});
