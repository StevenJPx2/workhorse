/**
 * Tests for useFocusZone hook and createFocusZoneManager
 */

import { describe, expect, it, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useFocusZone, createFocusZoneManager } from "./use-focus-zone.ts";

describe("useFocusZone", () => {
  describe("initial state", () => {
    it("should be inactive by default", () => {
      createRoot((dispose) => {
        const { isActive, zoneId } = useFocusZone({ zoneId: "test" });
        expect(isActive()).toBe(false);
        expect(zoneId).toBe("test");
        dispose();
      });
    });

    it("should respect initialActive option", () => {
      createRoot((dispose) => {
        const { isActive } = useFocusZone({
          zoneId: "test",
          initialActive: true,
        });
        expect(isActive()).toBe(true);
        dispose();
      });
    });
  });

  describe("activate", () => {
    it("should set isActive to true", () => {
      createRoot((dispose) => {
        const { isActive, activate } = useFocusZone({ zoneId: "test" });
        activate();
        expect(isActive()).toBe(true);
        dispose();
      });
    });

    it("should call onActivate callback", () => {
      createRoot((dispose) => {
        const onActivate = mock(() => {});
        const { activate } = useFocusZone({ zoneId: "test", onActivate });
        activate();
        expect(onActivate).toHaveBeenCalledTimes(1);
        dispose();
      });
    });

    it("should not call onActivate if already active", () => {
      createRoot((dispose) => {
        const onActivate = mock(() => {});
        const { activate } = useFocusZone({
          zoneId: "test",
          initialActive: true,
          onActivate,
        });
        activate();
        expect(onActivate).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("deactivate", () => {
    it("should set isActive to false", () => {
      createRoot((dispose) => {
        const { isActive, activate, deactivate } = useFocusZone({
          zoneId: "test",
        });
        activate();
        expect(isActive()).toBe(true);
        deactivate();
        expect(isActive()).toBe(false);
        dispose();
      });
    });

    it("should call onDeactivate callback", () => {
      createRoot((dispose) => {
        const onDeactivate = mock(() => {});
        const { activate, deactivate } = useFocusZone({
          zoneId: "test",
          onDeactivate,
        });
        activate();
        deactivate();
        expect(onDeactivate).toHaveBeenCalledTimes(1);
        dispose();
      });
    });

    it("should not call onDeactivate if already inactive", () => {
      createRoot((dispose) => {
        const onDeactivate = mock(() => {});
        const { deactivate } = useFocusZone({ zoneId: "test", onDeactivate });
        deactivate();
        expect(onDeactivate).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("toggle", () => {
    it("should activate when inactive", () => {
      createRoot((dispose) => {
        const { isActive, toggle } = useFocusZone({ zoneId: "test" });
        expect(isActive()).toBe(false);
        toggle();
        expect(isActive()).toBe(true);
        dispose();
      });
    });

    it("should deactivate when active", () => {
      createRoot((dispose) => {
        const { isActive, toggle } = useFocusZone({
          zoneId: "test",
          initialActive: true,
        });
        expect(isActive()).toBe(true);
        toggle();
        expect(isActive()).toBe(false);
        dispose();
      });
    });

    it("should call appropriate callbacks", () => {
      createRoot((dispose) => {
        const onActivate = mock(() => {});
        const onDeactivate = mock(() => {});
        const { toggle } = useFocusZone({
          zoneId: "test",
          onActivate,
          onDeactivate,
        });

        toggle(); // Activate
        expect(onActivate).toHaveBeenCalledTimes(1);

        toggle(); // Deactivate
        expect(onDeactivate).toHaveBeenCalledTimes(1);
        dispose();
      });
    });
  });
});

describe("createFocusZoneManager", () => {
  describe("initial state", () => {
    it("should have no active zone by default", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager();
        expect(manager.activeZone()).toBeNull();
        dispose();
      });
    });

    it("should respect initial zone", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager("sidebar");
        expect(manager.activeZone()).toBe("sidebar");
        dispose();
      });
    });
  });

  describe("isZoneActive", () => {
    it("should return true for active zone", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager("sidebar");
        expect(manager.isZoneActive("sidebar")).toBe(true);
        expect(manager.isZoneActive("main")).toBe(false);
        dispose();
      });
    });

    it("should return false when no zone active", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager();
        expect(manager.isZoneActive("sidebar")).toBe(false);
        dispose();
      });
    });
  });

  describe("activateZone", () => {
    it("should set active zone", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager();
        manager.activateZone("main");
        expect(manager.activeZone()).toBe("main");
        expect(manager.isZoneActive("main")).toBe(true);
        dispose();
      });
    });

    it("should switch between zones", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager("sidebar");
        expect(manager.isZoneActive("sidebar")).toBe(true);

        manager.activateZone("main");
        expect(manager.isZoneActive("sidebar")).toBe(false);
        expect(manager.isZoneActive("main")).toBe(true);
        dispose();
      });
    });

    it("should not trigger change if same zone", () => {
      createRoot((dispose) => {
        const callback = mock((_zone: string | null) => {});
        const manager = createFocusZoneManager("sidebar");
        manager.onZoneChange(callback);

        manager.activateZone("sidebar"); // Same zone
        expect(callback).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("deactivateZone", () => {
    it("should clear active zone", () => {
      createRoot((dispose) => {
        const manager = createFocusZoneManager("sidebar");
        manager.deactivateZone();
        expect(manager.activeZone()).toBeNull();
        dispose();
      });
    });

    it("should do nothing if no zone active", () => {
      createRoot((dispose) => {
        const callback = mock((_zone: string | null) => {});
        const manager = createFocusZoneManager();
        manager.onZoneChange(callback);

        manager.deactivateZone();
        expect(callback).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("onZoneChange", () => {
    it("should call callback on zone change", () => {
      createRoot((dispose) => {
        const callback = mock((_zone: string | null) => {});
        const manager = createFocusZoneManager();
        manager.onZoneChange(callback);

        manager.activateZone("main");
        expect(callback).toHaveBeenCalledWith("main");
        dispose();
      });
    });

    it("should call callback on deactivate", () => {
      createRoot((dispose) => {
        const callback = mock((_zone: string | null) => {});
        const manager = createFocusZoneManager("sidebar");
        manager.onZoneChange(callback);

        manager.deactivateZone();
        expect(callback).toHaveBeenCalledWith(null);
        dispose();
      });
    });

    it("should return unsubscribe function", () => {
      createRoot((dispose) => {
        const callback = mock((_zone: string | null) => {});
        const manager = createFocusZoneManager();
        const unsubscribe = manager.onZoneChange(callback);

        unsubscribe();
        manager.activateZone("main");
        expect(callback).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should support multiple callbacks", () => {
      createRoot((dispose) => {
        const callback1 = mock((_zone: string | null) => {});
        const callback2 = mock((_zone: string | null) => {});
        const manager = createFocusZoneManager();
        manager.onZoneChange(callback1);
        manager.onZoneChange(callback2);

        manager.activateZone("main");
        expect(callback1).toHaveBeenCalledWith("main");
        expect(callback2).toHaveBeenCalledWith("main");
        dispose();
      });
    });
  });
});
