/**
 * Tests for useInteractive hook
 */

import { describe, expect, it, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useInteractive } from "./use-interactive.ts";

describe("useInteractive", () => {
  describe("initial state", () => {
    it("should start with all states as false", () => {
      createRoot((dispose) => {
        const { isHovered, isPressed, isHighlighted } = useInteractive();
        expect(isHovered()).toBe(false);
        expect(isPressed()).toBe(false);
        expect(isHighlighted()).toBe(false);
        dispose();
      });
    });
  });

  describe("interactiveProps", () => {
    it("should provide all mouse handlers", () => {
      createRoot((dispose) => {
        const { interactiveProps } = useInteractive();
        expect(interactiveProps.onMouseOver).toBeDefined();
        expect(interactiveProps.onMouseOut).toBeDefined();
        expect(interactiveProps.onMouseDown).toBeDefined();
        expect(interactiveProps.onMouseUp).toBeDefined();
        dispose();
      });
    });

    it("should set isHovered on mouseOver/mouseOut", () => {
      createRoot((dispose) => {
        const { isHovered, interactiveProps } = useInteractive();
        expect(isHovered()).toBe(false);
        interactiveProps.onMouseOver();
        expect(isHovered()).toBe(true);
        interactiveProps.onMouseOut();
        expect(isHovered()).toBe(false);
        dispose();
      });
    });

    it("should set isPressed on mouseDown/mouseUp", () => {
      createRoot((dispose) => {
        const { isPressed, interactiveProps } = useInteractive();
        expect(isPressed()).toBe(false);
        interactiveProps.onMouseDown();
        expect(isPressed()).toBe(true);
        interactiveProps.onMouseUp();
        expect(isPressed()).toBe(false);
        dispose();
      });
    });

    it("should reset isPressed on mouseOut", () => {
      createRoot((dispose) => {
        const { isPressed, interactiveProps } = useInteractive();
        interactiveProps.onMouseDown();
        expect(isPressed()).toBe(true);
        interactiveProps.onMouseOut();
        expect(isPressed()).toBe(false);
        dispose();
      });
    });
  });

  describe("isHighlighted", () => {
    it("should mirror isHovered state", () => {
      createRoot((dispose) => {
        const { isHighlighted, interactiveProps } = useInteractive();
        expect(isHighlighted()).toBe(false);
        interactiveProps.onMouseOver();
        expect(isHighlighted()).toBe(true);
        interactiveProps.onMouseOut();
        expect(isHighlighted()).toBe(false);
        dispose();
      });
    });
  });

  describe("callbacks", () => {
    it("should call onPress when mouseDown", () => {
      createRoot((dispose) => {
        const onPress = mock(() => {});
        const { interactiveProps } = useInteractive({ onPress });
        interactiveProps.onMouseDown();
        expect(onPress).toHaveBeenCalledTimes(1);
        dispose();
      });
    });

    it("should call onHover with correct values", () => {
      createRoot((dispose) => {
        const onHover = mock(() => {});
        const { interactiveProps } = useInteractive({ onHover });
        interactiveProps.onMouseOver();
        expect(onHover).toHaveBeenCalledWith(true);
        interactiveProps.onMouseOut();
        expect(onHover).toHaveBeenCalledWith(false);
        dispose();
      });
    });
  });

  describe("disabled state", () => {
    it("should not set isHovered when disabled", () => {
      createRoot((dispose) => {
        const { isHovered, interactiveProps } = useInteractive({ disabled: true });
        interactiveProps.onMouseOver();
        expect(isHovered()).toBe(false);
        dispose();
      });
    });

    it("should not set isPressed when disabled", () => {
      createRoot((dispose) => {
        const { isPressed, interactiveProps } = useInteractive({ disabled: true });
        interactiveProps.onMouseDown();
        expect(isPressed()).toBe(false);
        dispose();
      });
    });

    it("should not call onPress when disabled", () => {
      createRoot((dispose) => {
        const onPress = mock(() => {});
        const { interactiveProps } = useInteractive({ disabled: true, onPress });
        interactiveProps.onMouseDown();
        expect(onPress).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should not call onHover on mouseOver when disabled", () => {
      createRoot((dispose) => {
        const onHover = mock(() => {});
        const { interactiveProps } = useInteractive({ disabled: true, onHover });
        interactiveProps.onMouseOver();
        expect(onHover).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should still call onHover on mouseOut when disabled", () => {
      // Ensures state resets properly even if disabled mid-interaction
      createRoot((dispose) => {
        const onHover = mock(() => {});
        const { interactiveProps } = useInteractive({ disabled: true, onHover });
        interactiveProps.onMouseOut();
        expect(onHover).toHaveBeenCalledWith(false);
        dispose();
      });
    });
  });

  describe("full interaction flow", () => {
    it("should handle complete interaction cycle", () => {
      createRoot((dispose) => {
        const { isHovered, isPressed, isHighlighted, interactiveProps } = useInteractive();

        // Initial state
        expect(isHovered()).toBe(false);
        expect(isPressed()).toBe(false);
        expect(isHighlighted()).toBe(false);

        // Hover
        interactiveProps.onMouseOver();
        expect(isHovered()).toBe(true);
        expect(isHighlighted()).toBe(true);

        // Press
        interactiveProps.onMouseDown();
        expect(isPressed()).toBe(true);

        // Release
        interactiveProps.onMouseUp();
        expect(isPressed()).toBe(false);

        // Leave
        interactiveProps.onMouseOut();
        expect(isHovered()).toBe(false);

        dispose();
      });
    });
  });
});
