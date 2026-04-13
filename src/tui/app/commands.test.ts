/**
 * Tests for command palette commands
 */

import { describe, it, expect, mock } from "bun:test";
import { createCommands } from "./commands.ts";
import type { CommandActions } from "./commands.ts";
import {
  isActionCommand,
  isSubmenuCommand,
  type SubmenuItem,
} from "../components/command-palette/types.ts";

describe("createCommands", () => {
  const createMockActions = (): CommandActions => ({
    addTicket: mock(() => {}),
    closeTicket: mock(() => {}),
    openInJira: mock(() => {}),
    escalate: mock(() => {}),
    switchAgent: mock(() => {}),
    toggleAgent: mock(() => {}),
    toggleHelp: mock(() => {}),
    quit: mock(() => {}),
    setTheme: mock(() => {}),
    currentTheme: mock(() => "tokyonight"),
  });

  it("should create all ticket action commands", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const ticketCommands = commands.filter((c) => c.category === "Tickets");
    expect(ticketCommands.length).toBe(6);

    expect(ticketCommands.map((c) => c.id)).toEqual([
      "add-ticket",
      "close-ticket",
      "open-in-jira",
      "escalate",
      "switch-agent",
      "toggle-agent",
    ]);
  });

  it("should assign correct shortcuts to ticket commands", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    expect(commands.find((c) => c.id === "add-ticket")?.shortcut).toBe("n");
    expect(commands.find((c) => c.id === "close-ticket")?.shortcut).toBe("x");
    expect(commands.find((c) => c.id === "open-in-jira")?.shortcut).toBe("o");
    expect(commands.find((c) => c.id === "escalate")?.shortcut).toBe("e");
    expect(commands.find((c) => c.id === "switch-agent")?.shortcut).toBe("a");
    expect(commands.find((c) => c.id === "toggle-agent")?.shortcut).toBe("s");
  });

  it("should create theme submenu with all themes", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const themeCommand = commands.find((c) => c.id === "theme");
    expect(themeCommand).toBeDefined();
    expect(isSubmenuCommand(themeCommand!)).toBe(true);
    expect(themeCommand?.category).toBe("Theme");
    expect(themeCommand?.shortcut).toBe("t");

    // Should have items for each theme
    if (isSubmenuCommand(themeCommand!)) {
      expect(themeCommand.items.length).toBeGreaterThan(0);
    }
  });

  it("should create theme items with proper labels", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const themeCommand = commands.find((c) => c.id === "theme");
    if (!isSubmenuCommand(themeCommand!)) return;

    const themeItems = themeCommand.items;

    // Check that theme names are capitalized
    for (const item of themeItems) {
      expect(item.label[0]).toBe(item.label[0].toUpperCase());
    }
  });

  it("should create app action commands", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const appCommands = commands.filter((c) => c.category === "App");
    expect(appCommands.length).toBe(2);
    expect(appCommands.map((c) => c.id)).toContain("show-help");
    expect(appCommands.map((c) => c.id)).toContain("quit");
  });

  it("should assign correct actions to commands", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const checkAction = (id: string, expectedAction: () => void) => {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd).toBeDefined();
      if (isActionCommand(cmd!)) {
        expect(cmd.action).toBe(expectedAction);
      }
    };

    checkAction("add-ticket", actions.addTicket);
    checkAction("close-ticket", actions.closeTicket);
    checkAction("open-in-jira", actions.openInJira);
    checkAction("escalate", actions.escalate);
    checkAction("switch-agent", actions.switchAgent);
    checkAction("toggle-agent", actions.toggleAgent);
    checkAction("show-help", actions.toggleHelp);
    checkAction("quit", actions.quit);
  });

  it("should have all commands with required properties", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    for (const cmd of commands) {
      expect(cmd.id).toBeDefined();
      expect(cmd.label).toBeDefined();
      expect(cmd.category).toBeDefined();
      expect(cmd.type).toBeDefined();
    }
  });

  it("should theme isActive check compare with current theme", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const themeCommand = commands.find((c) => c.id === "theme");
    if (!isSubmenuCommand(themeCommand!)) return;

    const tokyonightItem = themeCommand.items.find((i: SubmenuItem) => i.id === "theme-tokyonight");

    // currentTheme returns "tokyonight", so this should be active
    expect(tokyonightItem?.isActive?.()).toBe(true);
  });

  it("should theme isActive check returns false for non-active theme", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const themeCommand = commands.find((c) => c.id === "theme");
    if (!isSubmenuCommand(themeCommand!)) return;

    // Find a theme that isn't the current one (tokyonight)
    const otherItem = themeCommand.items.find((i: SubmenuItem) => i.id !== "theme-tokyonight");

    if (otherItem) {
      expect(otherItem.isActive?.()).toBe(false);
    }
  });

  it("should create commands array with correct length", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    // 6 ticket commands + 1 theme submenu + 2 app commands = 9
    expect(commands.length).toBe(9);
  });

  it("should set theme action calls setTheme with correct name", () => {
    const actions = createMockActions();
    const commands = createCommands(actions);

    const themeCommand = commands.find((c) => c.id === "theme");
    if (!isSubmenuCommand(themeCommand!)) return;

    const tokyonightItem = themeCommand.items.find((i: SubmenuItem) => i.id === "theme-tokyonight");

    tokyonightItem?.action?.();

    expect(actions.setTheme).toHaveBeenCalledWith("tokyonight");
  });
});
