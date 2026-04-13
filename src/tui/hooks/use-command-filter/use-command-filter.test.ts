/**
 * Tests for useCommandFilter hook
 */

import { describe, expect, it } from "bun:test";
import { createRoot } from "solid-js";
import { useCommandFilter } from "./use-command-filter.ts";

interface TestCommand {
  id: string;
  label: string;
}

const testCommands: TestCommand[] = [
  { id: "add-ticket", label: "Add New Ticket" },
  { id: "toggle-theme", label: "Toggle Theme" },
  { id: "quit", label: "Quit Application" },
  { id: "show-help", label: "Show Help" },
];

describe("useCommandFilter", () => {
  describe("initial state", () => {
    it("should start with empty query", () => {
      createRoot((dispose) => {
        const { query } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
        });
        expect(query()).toBe("");
        dispose();
      });
    });

    it("should return all items when query is empty", () => {
      createRoot((dispose) => {
        const { filteredItems } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
        });
        expect(filteredItems().length).toBe(testCommands.length);
        dispose();
      });
    });

    it("should use initialQuery when provided", () => {
      createRoot((dispose) => {
        const { query } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
          initialQuery: "ticket",
        });
        expect(query()).toBe("ticket");
        dispose();
      });
    });
  });

  describe("setQuery", () => {
    it("should update the query", () => {
      createRoot((dispose) => {
        const { query, setQuery } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
        });
        setQuery("test");
        expect(query()).toBe("test");
        dispose();
      });
    });
  });

  describe("clearQuery", () => {
    it("should reset query to empty string", () => {
      createRoot((dispose) => {
        const { query, setQuery, clearQuery } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
        });
        setQuery("test");
        expect(query()).toBe("test");
        clearQuery();
        expect(query()).toBe("");
        dispose();
      });
    });
  });

  describe("filteredItems with initialQuery", () => {
    it("should filter items based on initialQuery", () => {
      createRoot((dispose) => {
        const { filteredItems } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
          initialQuery: "ticket",
        });
        // Should match "Add New Ticket"
        expect(filteredItems().length).toBe(1);
        expect(filteredItems()[0].id).toBe("add-ticket");
        dispose();
      });
    });

    it("should return empty for no matches", () => {
      createRoot((dispose) => {
        const { filteredItems } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
          initialQuery: "xyz",
        });
        expect(filteredItems().length).toBe(0);
        dispose();
      });
    });

    it("should handle fuzzy patterns", () => {
      createRoot((dispose) => {
        const { filteredItems } = useCommandFilter({
          items: testCommands,
          getText: (cmd) => cmd.label,
          initialQuery: "ant", // A-N-T matches "Add New Ticket"
        });
        expect(filteredItems().length).toBe(1);
        expect(filteredItems()[0].id).toBe("add-ticket");
        dispose();
      });
    });
  });

  describe("accessor items", () => {
    it("should work with function accessor for items", () => {
      createRoot((dispose) => {
        const getItems = () => testCommands;
        const { filteredItems } = useCommandFilter({
          items: getItems,
          getText: (cmd) => cmd.label,
        });
        expect(filteredItems().length).toBe(testCommands.length);
        dispose();
      });
    });
  });
});
