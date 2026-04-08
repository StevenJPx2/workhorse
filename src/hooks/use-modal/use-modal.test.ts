/**
 * Tests for useModal hook
 */

import { describe, expect, it, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useModal } from "./use-modal.ts";

describe("useModal", () => {
  describe("initial state", () => {
    it("should be closed by default", () => {
      createRoot((dispose) => {
        const { isOpen } = useModal();
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should respect initialOpen option", () => {
      createRoot((dispose) => {
        const { isOpen } = useModal({ initialOpen: true });
        expect(isOpen()).toBe(true);
        dispose();
      });
    });

    it("should have undefined data by default", () => {
      createRoot((dispose) => {
        const { data } = useModal<string>();
        expect(data()).toBeUndefined();
        dispose();
      });
    });

    it("should respect initialData option", () => {
      createRoot((dispose) => {
        const { data } = useModal<string>({ initialData: "test" });
        expect(data()).toBe("test");
        dispose();
      });
    });
  });

  describe("open", () => {
    it("should set isOpen to true", () => {
      createRoot((dispose) => {
        const { isOpen, open } = useModal();
        open();
        expect(isOpen()).toBe(true);
        dispose();
      });
    });

    it("should set data when provided", () => {
      createRoot((dispose) => {
        const { data, open } = useModal<string>();
        open("payload");
        expect(data()).toBe("payload");
        dispose();
      });
    });

    it("should call onOpen callback", () => {
      createRoot((dispose) => {
        const onOpen = mock(() => {});
        const { open } = useModal({ onOpen });
        open();
        expect(onOpen).toHaveBeenCalled();
        dispose();
      });
    });

    it("should pass data to onOpen callback", () => {
      createRoot((dispose) => {
        const onOpen = mock((_data?: string) => {});
        const { open } = useModal<string>({ onOpen });
        open("test-data");
        expect(onOpen).toHaveBeenCalledWith("test-data");
        dispose();
      });
    });
  });

  describe("close", () => {
    it("should set isOpen to false", () => {
      createRoot((dispose) => {
        const { isOpen, open, close } = useModal();
        open();
        expect(isOpen()).toBe(true);
        close();
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should call onClose callback", () => {
      createRoot((dispose) => {
        const onClose = mock(() => {});
        const { open, close } = useModal({ onClose });
        open();
        close();
        expect(onClose).toHaveBeenCalled();
        dispose();
      });
    });

    it("should preserve data after close", () => {
      createRoot((dispose) => {
        const { data, open, close } = useModal<string>();
        open("preserved");
        close();
        expect(data()).toBe("preserved");
        dispose();
      });
    });
  });

  describe("toggle", () => {
    it("should open when closed", () => {
      createRoot((dispose) => {
        const { isOpen, toggle } = useModal();
        expect(isOpen()).toBe(false);
        toggle();
        expect(isOpen()).toBe(true);
        dispose();
      });
    });

    it("should close when open", () => {
      createRoot((dispose) => {
        const { isOpen, toggle } = useModal({ initialOpen: true });
        expect(isOpen()).toBe(true);
        toggle();
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should call appropriate callbacks", () => {
      createRoot((dispose) => {
        const onOpen = mock(() => {});
        const onClose = mock(() => {});
        const { toggle } = useModal({ onOpen, onClose });

        toggle(); // Open
        expect(onOpen).toHaveBeenCalled();

        toggle(); // Close
        expect(onClose).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("setData", () => {
    it("should update data without changing open state", () => {
      createRoot((dispose) => {
        const { isOpen, data, setData } = useModal<string>();
        expect(isOpen()).toBe(false);

        setData("new-data");
        expect(data()).toBe("new-data");
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should update data while modal is open", () => {
      createRoot((dispose) => {
        const { isOpen, data, open, setData } = useModal<string>();
        open("initial");
        expect(isOpen()).toBe(true);
        expect(data()).toBe("initial");

        setData("updated");
        expect(data()).toBe("updated");
        expect(isOpen()).toBe(true);
        dispose();
      });
    });

    it("should allow setting data to undefined", () => {
      createRoot((dispose) => {
        const { data, setData } = useModal<string>({ initialData: "test" });
        expect(data()).toBe("test");

        setData(undefined);
        expect(data()).toBeUndefined();
        dispose();
      });
    });
  });

  describe("typed data", () => {
    interface TicketData {
      id: string;
      summary: string;
    }

    it("should handle complex data types", () => {
      createRoot((dispose) => {
        const { data, open } = useModal<TicketData>();
        open({ id: "AM-123", summary: "Fix bug" });
        expect(data()?.id).toBe("AM-123");
        expect(data()?.summary).toBe("Fix bug");
        dispose();
      });
    });

    it("should update complex data", () => {
      createRoot((dispose) => {
        const { data, setData } = useModal<TicketData>();
        setData({ id: "AM-456", summary: "New feature" });
        expect(data()?.id).toBe("AM-456");
        dispose();
      });
    });
  });
});
