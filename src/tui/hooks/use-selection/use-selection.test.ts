/**
 * Tests for useSelection hook
 */

import { describe, expect, it, mock } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { useSelection } from "./use-selection.ts";

describe("useSelection", () => {
  const createItems = () => ["a", "b", "c", "d", "e"];

  describe("initial state", () => {
    it("should have no selection by default", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectedItem } = useSelection({ items });
        expect(selectedIndex()).toBe(-1);
        expect(selectedItem()).toBeUndefined();
        dispose();
      });
    });

    it("should respect initialIndex option", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectedItem } = useSelection({
          items,
          initialIndex: 2,
        });
        expect(selectedIndex()).toBe(2);
        expect(selectedItem()).toBe("c");
        dispose();
      });
    });
  });

  describe("select", () => {
    it("should select by index", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectedItem, select } = useSelection({ items });
        select(1);
        expect(selectedIndex()).toBe(1);
        expect(selectedItem()).toBe("b");
        dispose();
      });
    });

    it("should clamp to valid range when not wrapping", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select } = useSelection({ items, wrap: false });

        select(10);
        expect(selectedIndex()).toBe(4); // Clamped to max

        select(-5);
        expect(selectedIndex()).toBe(-1); // Clamped to -1 (no selection)
        dispose();
      });
    });

    it("should wrap around when wrap is true", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select } = useSelection({ items, wrap: true });

        select(5);
        expect(selectedIndex()).toBe(0); // Wrapped to start

        select(-1);
        expect(selectedIndex()).toBe(4); // Wrapped to end
        dispose();
      });
    });

    it("should call onSelect callback", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const onSelect = mock((_idx: number, _item: string | undefined) => {});
        const { select } = useSelection({ items, onSelect });

        select(2);
        expect(onSelect).toHaveBeenCalledWith(2, "c");
        dispose();
      });
    });

    it("should not call onSelect if selection unchanged", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const onSelect = mock((_idx: number, _item: string | undefined) => {});
        const { select } = useSelection({ items, onSelect, initialIndex: 2 });

        select(2); // Same index
        expect(onSelect).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("selectByKey", () => {
    it("should select by default key (index)", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectByKey } = useSelection({ items });
        selectByKey(3);
        expect(selectedIndex()).toBe(3);
        dispose();
      });
    });

    it("should select by custom key", () => {
      createRoot((dispose) => {
        interface Item {
          id: string;
          name: string;
        }
        const [items] = createSignal<Item[]>([
          { id: "x", name: "First" },
          { id: "y", name: "Second" },
          { id: "z", name: "Third" },
        ]);
        const { selectedIndex, selectedItem, selectByKey } = useSelection({
          items,
          getKey: (item) => item.id,
        });

        selectByKey("y");
        expect(selectedIndex()).toBe(1);
        expect(selectedItem()?.name).toBe("Second");
        dispose();
      });
    });

    it("should do nothing if key not found", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectByKey } = useSelection({
          items,
          initialIndex: 2,
        });
        selectByKey(99);
        expect(selectedIndex()).toBe(2); // Unchanged
        dispose();
      });
    });
  });

  describe("isSelected", () => {
    it("should return true for selected index", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { isSelected, select } = useSelection({ items });
        select(2);
        expect(isSelected(2)).toBe(true);
        expect(isSelected(0)).toBe(false);
        expect(isSelected(4)).toBe(false);
        dispose();
      });
    });

    it("should return false when no selection", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { isSelected } = useSelection({ items });
        expect(isSelected(0)).toBe(false);
        expect(isSelected(-1)).toBe(false);
        dispose();
      });
    });
  });

  describe("selectNext", () => {
    it("should move to next item", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectNext } = useSelection({ items });
        select(1);
        selectNext();
        expect(selectedIndex()).toBe(2);
        dispose();
      });
    });

    it("should select first when no selection", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectNext } = useSelection({ items });
        selectNext();
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });

    it("should stop at end when not wrapping", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectNext } = useSelection({
          items,
          wrap: false,
        });
        select(4);
        selectNext();
        expect(selectedIndex()).toBe(4);
        dispose();
      });
    });

    it("should wrap to start when wrapping", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectNext } = useSelection({
          items,
          wrap: true,
        });
        select(4);
        selectNext();
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });

    it("should do nothing for empty list", () => {
      createRoot((dispose) => {
        const [items] = createSignal<string[]>([]);
        const { selectedIndex, selectNext } = useSelection({ items });
        selectNext();
        expect(selectedIndex()).toBe(-1);
        dispose();
      });
    });
  });

  describe("selectPrev", () => {
    it("should move to previous item", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectPrev } = useSelection({ items });
        select(2);
        selectPrev();
        expect(selectedIndex()).toBe(1);
        dispose();
      });
    });

    it("should select last when no selection", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectPrev } = useSelection({ items });
        selectPrev();
        expect(selectedIndex()).toBe(4);
        dispose();
      });
    });

    it("should stop at start when not wrapping", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectPrev } = useSelection({
          items,
          wrap: false,
        });
        select(0);
        selectPrev();
        expect(selectedIndex()).toBe(-1);
        dispose();
      });
    });

    it("should wrap to end when wrapping", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectPrev } = useSelection({
          items,
          wrap: true,
        });
        select(0);
        selectPrev();
        expect(selectedIndex()).toBe(4);
        dispose();
      });
    });

    it("should do nothing for empty list", () => {
      createRoot((dispose) => {
        const [items] = createSignal<string[]>([]);
        const { selectedIndex, selectPrev } = useSelection({ items });
        selectPrev();
        expect(selectedIndex()).toBe(-1);
        dispose();
      });
    });
  });

  describe("selectFirst", () => {
    it("should select first item", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectFirst } = useSelection({ items });
        select(3);
        selectFirst();
        expect(selectedIndex()).toBe(0);
        dispose();
      });
    });

    it("should do nothing for empty list", () => {
      createRoot((dispose) => {
        const [items] = createSignal<string[]>([]);
        const { selectedIndex, selectFirst } = useSelection({ items });
        selectFirst();
        expect(selectedIndex()).toBe(-1);
        dispose();
      });
    });
  });

  describe("selectLast", () => {
    it("should select last item", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, select, selectLast } = useSelection({ items });
        select(1);
        selectLast();
        expect(selectedIndex()).toBe(4);
        dispose();
      });
    });

    it("should do nothing for empty list", () => {
      createRoot((dispose) => {
        const [items] = createSignal<string[]>([]);
        const { selectedIndex, selectLast } = useSelection({ items });
        selectLast();
        expect(selectedIndex()).toBe(-1);
        dispose();
      });
    });
  });

  describe("clear", () => {
    it("should clear selection", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const { selectedIndex, selectedItem, select, clear } = useSelection({
          items,
        });
        select(2);
        clear();
        expect(selectedIndex()).toBe(-1);
        expect(selectedItem()).toBeUndefined();
        dispose();
      });
    });

    it("should call onSelect with -1 and undefined", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const onSelect = mock((_idx: number, _item: string | undefined) => {});
        const { select, clear } = useSelection({ items, onSelect });
        select(2);
        onSelect.mockClear();
        clear();
        expect(onSelect).toHaveBeenCalledWith(-1, undefined);
        dispose();
      });
    });

    it("should not call onSelect if already cleared", () => {
      createRoot((dispose) => {
        const [items] = createSignal(createItems());
        const onSelect = mock((_idx: number, _item: string | undefined) => {});
        const { clear } = useSelection({ items, onSelect });
        clear(); // Already at -1
        expect(onSelect).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("reactive items", () => {
    it("should handle items changing", () => {
      createRoot((dispose) => {
        const [items, setItems] = createSignal(createItems());
        const { selectedIndex, selectedItem, select } = useSelection({ items });

        select(2);
        expect(selectedItem()).toBe("c");

        // Change items
        setItems(["x", "y", "z"]);
        expect(selectedIndex()).toBe(2); // Index preserved
        expect(selectedItem()).toBe("z"); // New item at index
        dispose();
      });
    });

    it("should return undefined if index out of bounds after change", () => {
      createRoot((dispose) => {
        const [items, setItems] = createSignal(createItems());
        const { selectedIndex, selectedItem, select } = useSelection({ items });

        select(4);
        expect(selectedItem()).toBe("e");

        // Shrink items
        setItems(["a", "b"]);
        expect(selectedIndex()).toBe(4); // Index unchanged
        expect(selectedItem()).toBeUndefined(); // Out of bounds
        dispose();
      });
    });
  });
});
