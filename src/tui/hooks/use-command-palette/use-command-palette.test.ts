/**
 * Tests for useCommandPalette hook
 */

import { describe, expect, it, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useCommandPalette } from "./use-command-palette.ts";
import type {
  ActionCommand,
  SubmenuCommand,
  Command,
} from "../../components/command-palette/types.ts";

const testCommands: Command[] = [
  { id: "add-ticket", label: "Add New Ticket", type: "action", action: () => {} } as ActionCommand,
  {
    id: "toggle-theme",
    label: "Toggle Theme",
    type: "submenu",
    items: [
      { id: "theme-default", label: "Default", action: () => {} },
      { id: "theme-gruvbox", label: "Gruvbox", action: () => {} },
    ],
  } as SubmenuCommand,
  { id: "quit", label: "Quit", type: "action", action: () => {} } as ActionCommand,
];

describe("useCommandPalette", () => {
  describe("initial state", () => {
    it("should start with correct defaults", () => {
      createRoot((dispose) => {
        const { isOpen, query, selectedIndex, isInSubmenu, currentSubmenu } = useCommandPalette({
          commands: testCommands,
        });
        expect(isOpen()).toBe(false);
        expect(query()).toBe("");
        expect(selectedIndex()).toBe(0);
        expect(isInSubmenu()).toBe(false);
        expect(currentSubmenu()).toBe(null);
        dispose();
      });
    });
  });

  describe("open/close/toggle", () => {
    it("should open and close the palette", () => {
      createRoot((dispose) => {
        const { isOpen, open, close } = useCommandPalette({ commands: testCommands });
        expect(isOpen()).toBe(false);
        open();
        expect(isOpen()).toBe(true);
        close();
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should toggle the palette", () => {
      createRoot((dispose) => {
        const { isOpen, toggle } = useCommandPalette({ commands: testCommands });
        toggle();
        expect(isOpen()).toBe(true);
        toggle();
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should call onClose when closing", () => {
      createRoot((dispose) => {
        const onClose = mock(() => {});
        const { open, close } = useCommandPalette({ commands: testCommands, onClose });
        open();
        close();
        expect(onClose).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("query management", () => {
    it("should set and update query", () => {
      createRoot((dispose) => {
        const { query, setQuery } = useCommandPalette({ commands: testCommands });
        setQuery("test");
        expect(query()).toBe("test");
        dispose();
      });
    });

    it("should append to query", () => {
      createRoot((dispose) => {
        const { query, appendToQuery } = useCommandPalette({ commands: testCommands });
        appendToQuery("a");
        appendToQuery("b");
        expect(query()).toBe("ab");
        dispose();
      });
    });

    it("should handle backspace correctly", () => {
      createRoot((dispose) => {
        const { query, setQuery, backspace } = useCommandPalette({ commands: testCommands });
        setQuery("test");
        backspace();
        expect(query()).toBe("tes");
        backspace();
        backspace();
        backspace();
        backspace(); // Past empty
        expect(query()).toBe("");
        dispose();
      });
    });
  });

  describe("selection navigation", () => {
    it("should navigate with selectNext and selectPrevious", () => {
      createRoot((dispose) => {
        const { selectedIndex, selectNext, selectPrevious } = useCommandPalette({
          commands: testCommands,
        });
        selectNext();
        expect(selectedIndex()).toBe(1);
        selectPrevious();
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });

    it("should wrap selection at boundaries", () => {
      createRoot((dispose) => {
        const { selectedIndex, selectNext, selectPrevious } = useCommandPalette({
          commands: testCommands,
        });
        selectPrevious(); // Wrap to end
        expect(selectedIndex()).toBe(2);
        selectNext(); // Wrap to start
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });

    it("should reset selection", () => {
      createRoot((dispose) => {
        const { selectedIndex, selectNext, resetSelection } = useCommandPalette({
          commands: testCommands,
        });
        selectNext();
        selectNext();
        resetSelection();
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });
  });

  describe("goBack", () => {
    it("should close palette when not in submenu", () => {
      createRoot((dispose) => {
        const { isOpen, open, goBack } = useCommandPalette({ commands: testCommands });
        open();
        goBack();
        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    // Note: Submenu tests require reactive environment which isn't available
    // in Solid.js SSR mode used by Bun tests. The submenu functionality
    // is tested via integration tests in the actual TUI.
  });

  describe("command execution", () => {
    it("should execute action when selecting non-submenu command", () => {
      createRoot((dispose) => {
        const actionMock = mock(() => {});
        const commands: Command[] = [
          { id: "test", label: "Test Action", type: "action", action: actionMock } as ActionCommand,
        ];
        const { open, executeSelected } = useCommandPalette({ commands });

        open();
        executeSelected();

        expect(actionMock).toHaveBeenCalled();
        dispose();
      });
    });

    it("should call onExecute when executing action", () => {
      createRoot((dispose) => {
        const onExecute = mock(() => {});
        const commands: Command[] = [
          { id: "test", label: "Test", type: "action", action: () => {} } as ActionCommand,
        ];
        const { open, executeSelected } = useCommandPalette({ commands, onExecute });

        open();
        executeSelected();

        expect(onExecute).toHaveBeenCalled();
        dispose();
      });
    });

    it("should close palette after executing action", () => {
      createRoot((dispose) => {
        const { open, isOpen, executeSelected } = useCommandPalette({ commands: testCommands });

        open();
        executeSelected(); // Execute "Add New Ticket"

        expect(isOpen()).toBe(false);
        dispose();
      });
    });

    it("should set currentSubmenu when selecting submenu command", () => {
      createRoot((dispose) => {
        // Use only submenu commands to ensure we select a submenu
        const submenuCommands: Command[] = [
          {
            id: "toggle-theme",
            label: "Toggle Theme",
            type: "submenu",
            items: [{ id: "theme-default", label: "Default", action: () => {} }],
          } as SubmenuCommand,
        ];

        const { open, executeSelected, currentSubmenu } = useCommandPalette({
          commands: submenuCommands,
        });

        open();
        executeSelected(); // Should enter submenu

        // currentSubmenu is set correctly (the signal itself)
        expect(currentSubmenu()?.id).toBe("toggle-theme");
        dispose();
      });
    });
  });

  describe("empty items handling", () => {
    it("should handle empty commands gracefully", () => {
      createRoot((dispose) => {
        const { selectNext, selectPrevious, selectedIndex } = useCommandPalette({
          commands: [],
        });

        selectNext();
        expect(selectedIndex()).toBe(0);
        selectPrevious();
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });

    it("should handle executeSelected with no selection", () => {
      createRoot((dispose) => {
        const { open, executeSelected, isOpen } = useCommandPalette({
          commands: [],
        });

        open();
        executeSelected(); // Should not throw

        // Palette stays open since nothing to execute
        expect(isOpen()).toBe(true);
        dispose();
      });
    });
  });

  describe("query filtering", () => {
    it("should reset selection when query changes", () => {
      createRoot((dispose) => {
        const { selectNext, appendToQuery, selectedIndex } = useCommandPalette({
          commands: testCommands,
        });

        selectNext();
        selectNext();
        expect(selectedIndex()).toBe(2);

        appendToQuery("a");
        expect(selectedIndex()).toBe(0); // Reset when query changes
        dispose();
      });
    });
  });
});
