/**
 * Tests for useTicketNavigation hook
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  handleNavigationKey,
  type UseTicketNavigationOptions,
  type NavigationContext,
} from "./use-ticket-navigation.ts";

describe("handleNavigationKey", () => {
  let onSelect: ReturnType<typeof mock>;
  let onNew: ReturnType<typeof mock>;
  let onOpen: ReturnType<typeof mock>;
  let options: UseTicketNavigationOptions;
  let context: NavigationContext;

  beforeEach(() => {
    onSelect = mock(() => {});
    onNew = mock(() => {});
    onOpen = mock(() => {});
    options = {
      ticketCount: () => 5,
      selectedIndex: () => 0,
      onSelect,
      onNew,
      onOpen,
    };
    context = {
      isInputMode: () => false,
    };
  });

  describe("input mode blocking", () => {
    it("should not handle keys when in input mode", () => {
      context.isInputMode = () => true;

      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should not handle new ticket when in input mode", () => {
      context.isInputMode = () => true;

      handleNavigationKey({ name: "n" }, options, context);

      expect(onNew).not.toHaveBeenCalled();
    });

    it("should not handle open when in input mode", () => {
      context.isInputMode = () => true;

      handleNavigationKey({ name: "enter" }, options, context);

      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe("disabled state", () => {
    it("should not handle keys when disabled", () => {
      options.disabled = () => true;

      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should not handle new ticket when disabled", () => {
      options.disabled = () => true;

      handleNavigationKey({ name: "n" }, options, context);

      expect(onNew).not.toHaveBeenCalled();
    });

    it("should not handle open when disabled", () => {
      options.disabled = () => true;

      handleNavigationKey({ name: "enter" }, options, context);

      expect(onOpen).not.toHaveBeenCalled();
    });

    it("should handle keys when disabled returns false", () => {
      options.disabled = () => false;

      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).toHaveBeenCalled();
    });

    it("should handle keys when disabled is undefined", () => {
      options.disabled = undefined;

      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).toHaveBeenCalled();
    });
  });

  describe("navigate down (j/down)", () => {
    it("should select next ticket on j key", () => {
      options.selectedIndex = () => 0;

      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("should select next ticket on down arrow", () => {
      options.selectedIndex = () => 1;

      handleNavigationKey({ name: "down" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it("should wrap to first ticket when at end", () => {
      options.selectedIndex = () => 4; // Last ticket (index 4 in 5 tickets)

      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(0);
    });
  });

  describe("navigate up (k/up)", () => {
    it("should select previous ticket on k key", () => {
      options.selectedIndex = () => 2;

      handleNavigationKey({ name: "k" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("should select previous ticket on up arrow", () => {
      options.selectedIndex = () => 3;

      handleNavigationKey({ name: "up" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it("should wrap to last ticket when at beginning", () => {
      options.selectedIndex = () => 0;

      handleNavigationKey({ name: "k" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(4); // Last ticket
    });
  });

  describe("quick jump (1-9)", () => {
    it("should jump to ticket 1 on key 1", () => {
      handleNavigationKey({ name: "1" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(0);
    });

    it("should jump to ticket 5 on key 5", () => {
      handleNavigationKey({ name: "5" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(4);
    });

    it("should not jump when number exceeds ticket count", () => {
      handleNavigationKey({ name: "6" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should not jump on key 0", () => {
      handleNavigationKey({ name: "0" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should handle single ticket with key 1", () => {
      options.ticketCount = () => 1;

      handleNavigationKey({ name: "1" }, options, context);

      expect(onSelect).toHaveBeenCalledWith(0);
    });

    it("should not jump when key 9 with 3 tickets", () => {
      options.ticketCount = () => 3;

      handleNavigationKey({ name: "9" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("new ticket (n/+)", () => {
    it("should call onNew on n key", () => {
      handleNavigationKey({ name: "n" }, options, context);

      expect(onNew).toHaveBeenCalled();
    });

    it("should call onNew on + key", () => {
      handleNavigationKey({ name: "+" }, options, context);

      expect(onNew).toHaveBeenCalled();
    });
  });

  describe("empty ticket list", () => {
    beforeEach(() => {
      options.ticketCount = () => 0;
    });

    it("should not navigate down when no tickets", () => {
      handleNavigationKey({ name: "j" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should not navigate up when no tickets", () => {
      handleNavigationKey({ name: "k" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should not quick jump when no tickets", () => {
      handleNavigationKey({ name: "1" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should allow new ticket when no tickets exist", () => {
      handleNavigationKey({ name: "n" }, options, context);

      expect(onNew).toHaveBeenCalled();
    });

    it("should allow new ticket with + when no tickets exist", () => {
      handleNavigationKey({ name: "+" }, options, context);

      expect(onNew).toHaveBeenCalled();
    });
  });

  describe("open ticket with agent (enter/return)", () => {
    it("should call onOpen with current index on enter key", () => {
      options.selectedIndex = () => 2;

      handleNavigationKey({ name: "enter" }, options, context);

      expect(onOpen).toHaveBeenCalledWith(2);
    });

    it("should call onOpen with current index on return key", () => {
      options.selectedIndex = () => 3;

      handleNavigationKey({ name: "return" }, options, context);

      expect(onOpen).toHaveBeenCalledWith(3);
    });

    it("should not call onOpen when in input mode", () => {
      context.isInputMode = () => true;

      handleNavigationKey({ name: "enter" }, options, context);

      expect(onOpen).not.toHaveBeenCalled();
    });

    it("should not call onOpen when disabled", () => {
      options.disabled = () => true;

      handleNavigationKey({ name: "enter" }, options, context);

      expect(onOpen).not.toHaveBeenCalled();
    });

    it("should not call onOpen when no tickets exist", () => {
      options.ticketCount = () => 0;

      handleNavigationKey({ name: "enter" }, options, context);

      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe("unhandled keys", () => {
    it("should ignore unrelated keys", () => {
      handleNavigationKey({ name: "x" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
      expect(onNew).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("should ignore escape key", () => {
      handleNavigationKey({ name: "escape" }, options, context);

      expect(onSelect).not.toHaveBeenCalled();
      expect(onNew).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
