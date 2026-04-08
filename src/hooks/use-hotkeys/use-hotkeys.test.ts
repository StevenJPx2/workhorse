/**
 * Tests for useHotkeys hook
 */

import { describe, expect, it, mock } from "bun:test";
import { createRoot } from "solid-js";
import {
  useHotkeys,
  createHotkeyManager,
  parseCombo,
  matchesCombo,
  type KeyInfo,
} from "./index.ts";

describe("parseCombo", () => {
  it("should parse single key", () => {
    const result = parseCombo("j");
    expect(result.name).toBe("j");
    expect(result.ctrl).toBeUndefined();
    expect(result.meta).toBeUndefined();
    expect(result.shift).toBeUndefined();
    expect(result.alt).toBeUndefined();
  });

  it("should parse ctrl modifier", () => {
    const result = parseCombo("ctrl+s");
    expect(result.name).toBe("s");
    expect(result.ctrl).toBe(true);
  });

  it("should parse control modifier (alias)", () => {
    const result = parseCombo("control+s");
    expect(result.name).toBe("s");
    expect(result.ctrl).toBe(true);
  });

  it("should parse cmd modifier", () => {
    const result = parseCombo("cmd+k");
    expect(result.name).toBe("k");
    expect(result.meta).toBe(true);
  });

  it("should parse meta modifier (alias)", () => {
    const result = parseCombo("meta+k");
    expect(result.name).toBe("k");
    expect(result.meta).toBe(true);
  });

  it("should parse shift modifier", () => {
    const result = parseCombo("shift+enter");
    expect(result.name).toBe("enter");
    expect(result.shift).toBe(true);
  });

  it("should parse alt modifier", () => {
    const result = parseCombo("alt+x");
    expect(result.name).toBe("x");
    expect(result.alt).toBe(true);
  });

  it("should parse option modifier (alias)", () => {
    const result = parseCombo("option+x");
    expect(result.name).toBe("x");
    expect(result.alt).toBe(true);
  });

  it("should parse multiple modifiers", () => {
    const result = parseCombo("ctrl+shift+s");
    expect(result.name).toBe("s");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(true);
  });

  it("should be case insensitive", () => {
    const result = parseCombo("CTRL+S");
    expect(result.name).toBe("s");
    expect(result.ctrl).toBe(true);
  });
});

describe("matchesCombo", () => {
  it("should match simple key", () => {
    const key: KeyInfo = { name: "j" };
    expect(matchesCombo(key, "j")).toBe(true);
    expect(matchesCombo(key, "k")).toBe(false);
  });

  it("should be case insensitive on key name", () => {
    const key: KeyInfo = { name: "J" };
    expect(matchesCombo(key, "j")).toBe(true);
  });

  it("should match with ctrl", () => {
    const key: KeyInfo = { name: "s", ctrl: true };
    expect(matchesCombo(key, "ctrl+s")).toBe(true);
    expect(matchesCombo(key, "s")).toBe(false);
  });

  it("should not match when key has extra modifier", () => {
    const key: KeyInfo = { name: "s", ctrl: true, shift: true };
    expect(matchesCombo(key, "ctrl+s")).toBe(false);
    expect(matchesCombo(key, "ctrl+shift+s")).toBe(true);
  });

  it("should not match when combo requires modifier key lacks", () => {
    const key: KeyInfo = { name: "s" };
    expect(matchesCombo(key, "ctrl+s")).toBe(false);
  });
});

describe("useHotkeys", () => {
  describe("initial state", () => {
    it("should be enabled by default", () => {
      createRoot((dispose) => {
        const { isEnabled, context } = useHotkeys({ context: "test" });
        expect(isEnabled()).toBe(true);
        expect(context).toBe("test");
        dispose();
      });
    });

    it("should respect initialEnabled option", () => {
      createRoot((dispose) => {
        const { isEnabled } = useHotkeys({
          context: "test",
          initialEnabled: false,
        });
        expect(isEnabled()).toBe(false);
        dispose();
      });
    });
  });

  describe("enable/disable", () => {
    it("should enable hotkeys", () => {
      createRoot((dispose) => {
        const { isEnabled, enable } = useHotkeys({
          context: "test",
          initialEnabled: false,
        });
        enable();
        expect(isEnabled()).toBe(true);
        dispose();
      });
    });

    it("should disable hotkeys", () => {
      createRoot((dispose) => {
        const { isEnabled, disable } = useHotkeys({ context: "test" });
        disable();
        expect(isEnabled()).toBe(false);
        dispose();
      });
    });
  });

  describe("register", () => {
    it("should register a hotkey", () => {
      createRoot((dispose) => {
        const handler = mock(() => {});
        const { register, getHotkeys } = useHotkeys({ context: "test" });

        register("j", handler, "Move down");

        const hotkeys = getHotkeys();
        expect(hotkeys.length).toBe(1);
        expect(hotkeys[0].combo).toBe("j");
        expect(hotkeys[0].description).toBe("Move down");
        dispose();
      });
    });

    it("should return unregister function", () => {
      createRoot((dispose) => {
        const handler = mock(() => {});
        const { register, getHotkeys } = useHotkeys({ context: "test" });

        const unregister = register("j", handler);
        expect(getHotkeys().length).toBe(1);

        unregister();
        expect(getHotkeys().length).toBe(0);
        dispose();
      });
    });

    it("should normalize combo to lowercase", () => {
      createRoot((dispose) => {
        const { register, getHotkeys } = useHotkeys({ context: "test" });
        register("CTRL+S", () => {});
        expect(getHotkeys()[0].combo).toBe("ctrl+s");
        dispose();
      });
    });
  });

  describe("handleKey", () => {
    it("should call handler for matching key", () => {
      createRoot((dispose) => {
        const handler = mock(() => {});
        const { register, handleKey } = useHotkeys({ context: "test" });
        register("j", handler);

        const handled = handleKey({ name: "j" });
        expect(handled).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        dispose();
      });
    });

    it("should return false for non-matching key", () => {
      createRoot((dispose) => {
        const handler = mock(() => {});
        const { register, handleKey } = useHotkeys({ context: "test" });
        register("j", handler);

        const handled = handleKey({ name: "k" });
        expect(handled).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should not call handler when disabled", () => {
      createRoot((dispose) => {
        const handler = mock(() => {});
        const { register, handleKey, disable } = useHotkeys({ context: "test" });
        register("j", handler);
        disable();

        const handled = handleKey({ name: "j" });
        expect(handled).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should handle modifier keys", () => {
      createRoot((dispose) => {
        const handler = mock(() => {});
        const { register, handleKey } = useHotkeys({ context: "test" });
        register("ctrl+s", handler);

        // Without modifier - should not match
        handleKey({ name: "s" });
        expect(handler).not.toHaveBeenCalled();

        // With modifier - should match
        handleKey({ name: "s", ctrl: true });
        expect(handler).toHaveBeenCalledTimes(1);
        dispose();
      });
    });
  });

  describe("getHotkeys", () => {
    it("should return all registered hotkeys", () => {
      createRoot((dispose) => {
        const { register, getHotkeys } = useHotkeys({ context: "test" });
        register("j", () => {}, "Down");
        register("k", () => {}, "Up");
        register("enter", () => {}, "Select");

        const hotkeys = getHotkeys();
        expect(hotkeys.length).toBe(3);
        expect(hotkeys.map((h) => h.combo)).toEqual(["j", "k", "enter"]);
        dispose();
      });
    });
  });
});

describe("createHotkeyManager", () => {
  describe("registerContext", () => {
    it("should create new context", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const ctx = manager.registerContext("sidebar");
        expect(ctx.context).toBe("sidebar");
        expect(ctx.isEnabled()).toBe(true);
        dispose();
      });
    });

    it("should return existing context if already registered", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const ctx1 = manager.registerContext("sidebar");
        const ctx2 = manager.registerContext("sidebar");
        expect(ctx1).toBe(ctx2);
        dispose();
      });
    });
  });

  describe("enableContext/disableContext", () => {
    it("should enable specific context", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const ctx = manager.registerContext("sidebar");
        ctx.disable();
        expect(ctx.isEnabled()).toBe(false);

        manager.enableContext("sidebar");
        expect(ctx.isEnabled()).toBe(true);
        dispose();
      });
    });

    it("should disable specific context", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const ctx = manager.registerContext("sidebar");
        expect(ctx.isEnabled()).toBe(true);

        manager.disableContext("sidebar");
        expect(ctx.isEnabled()).toBe(false);
        dispose();
      });
    });
  });

  describe("focusContext", () => {
    it("should enable only the focused context", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const sidebar = manager.registerContext("sidebar");
        const modal = manager.registerContext("modal");

        manager.focusContext("modal");
        expect(sidebar.isEnabled()).toBe(false);
        expect(modal.isEnabled()).toBe(true);
        dispose();
      });
    });

    it("should restore previous context when refocused", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const sidebar = manager.registerContext("sidebar");
        const modal = manager.registerContext("modal");

        manager.focusContext("modal");
        expect(sidebar.isEnabled()).toBe(false);

        manager.focusContext("sidebar");
        expect(sidebar.isEnabled()).toBe(true);
        expect(modal.isEnabled()).toBe(false);
        dispose();
      });
    });
  });

  describe("getAllHotkeys", () => {
    it("should return hotkeys from all contexts", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const sidebar = manager.registerContext("sidebar");
        const modal = manager.registerContext("modal");

        sidebar.register("j", () => {});
        sidebar.register("k", () => {});
        modal.register("escape", () => {});

        const all = manager.getAllHotkeys();
        expect(all.length).toBe(2);
        expect(all.find((c) => c.context === "sidebar")?.hotkeys.length).toBe(2);
        expect(all.find((c) => c.context === "modal")?.hotkeys.length).toBe(1);
        dispose();
      });
    });
  });

  describe("handleKey", () => {
    it("should delegate to enabled contexts", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const sidebarHandler = mock(() => {});
        const sidebar = manager.registerContext("sidebar");
        sidebar.register("j", sidebarHandler);

        const handled = manager.handleKey({ name: "j" });
        expect(handled).toBe(true);
        expect(sidebarHandler).toHaveBeenCalledTimes(1);
        dispose();
      });
    });

    it("should not trigger disabled contexts", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const sidebarHandler = mock(() => {});
        const sidebar = manager.registerContext("sidebar");
        sidebar.register("j", sidebarHandler);
        sidebar.disable();

        const handled = manager.handleKey({ name: "j" });
        expect(handled).toBe(false);
        expect(sidebarHandler).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should stop at first matching handler", () => {
      createRoot((dispose) => {
        const manager = createHotkeyManager();
        const handler1 = mock(() => {});
        const handler2 = mock(() => {});

        const ctx1 = manager.registerContext("ctx1");
        const ctx2 = manager.registerContext("ctx2");
        ctx1.register("j", handler1);
        ctx2.register("j", handler2);

        manager.handleKey({ name: "j" });
        // Only first should be called (order depends on Map iteration)
        expect(
          handler1.mock.calls.length + handler2.mock.calls.length
        ).toBe(1);
        dispose();
      });
    });
  });
});
