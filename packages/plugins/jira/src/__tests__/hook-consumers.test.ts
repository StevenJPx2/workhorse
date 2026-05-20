/**
 * Tests for Jira hook consumers — verifies API calls and completion events.
 */

import { describe, expect, it, vi } from "vitest";

import type { AtlassianClient } from "../client.ts";
import { registerHookConsumers } from "../hook-consumers.ts";

describe("registerHookConsumers", () => {
  describe("jira:transition.requested", () => {
    it("transitions issue and emits completion event", async () => {
      const mockClient = {
        getTransitions: vi.fn().mockResolvedValue([
          { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
          { id: "41", name: "Done", to: { name: "Done", id: "6" } },
        ]),
        transitionIssue: vi.fn().mockResolvedValue(undefined),
      } as unknown as AtlassianClient;

      const hooks = { on: vi.fn(), emit: vi.fn() } as any;
      const ctx = { hooks } as any;

      registerHookConsumers(ctx, mockClient);

      const handler = hooks.on.mock.calls.find(
        ([event]: [string, (...args: unknown[]) => unknown]) =>
          event === "jira:transition.requested",
      )![1];

      await handler({
        issueId: "AM-123",
        targetStatus: "Done",
        fromStatus: "To Do",
      });

      expect(mockClient.getTransitions).toHaveBeenCalledWith("AM-123");
      expect(mockClient.transitionIssue).toHaveBeenCalledWith("AM-123", "41");
      expect(hooks.emit).toHaveBeenCalledWith("jira:issue.transitioned", {
        issueId: "AM-123",
        from: "To Do",
        to: "Done",
      });
    });

    it("handles missing transition gracefully", async () => {
      const mockClient = {
        getTransitions: vi
          .fn()
          .mockResolvedValue([
            { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
          ]),
        transitionIssue: vi.fn(),
      } as unknown as AtlassianClient;

      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const hooks = { on: vi.fn(), emit: vi.fn() } as any;
      const ctx = { hooks } as any;

      registerHookConsumers(ctx, mockClient);

      const handler = hooks.on.mock.calls.find(
        ([event]: [string, (...args: unknown[]) => unknown]) =>
          event === "jira:transition.requested",
      )![1];

      await handler({
        issueId: "AM-123",
        targetStatus: "Blocked",
        fromStatus: "To Do",
      });

      expect(mockClient.transitionIssue).not.toHaveBeenCalled();
      expect(hooks.emit).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No transition to "Blocked" found'),
      );

      consoleWarn.mockRestore();
    });
  });

  describe("jira:assign.requested", () => {
    it("assigns to current user when assignee is 'self'", async () => {
      const mockClient = {
        getCurrentUser: vi.fn().mockResolvedValue({
          accountId: "user-123",
          displayName: "Test User",
        }),
        editIssue: vi.fn().mockResolvedValue(undefined),
      } as unknown as AtlassianClient;

      const hooks = { on: vi.fn(), emit: vi.fn() } as any;
      const ctx = { hooks } as any;

      registerHookConsumers(ctx, mockClient);

      const handler = hooks.on.mock.calls.find(
        ([event]: [string, (...args: unknown[]) => unknown]) => event === "jira:assign.requested",
      )![1];

      await handler({
        issueId: "AM-123",
        assignee: "self",
      });

      expect(mockClient.getCurrentUser).toHaveBeenCalled();
      expect(mockClient.editIssue).toHaveBeenCalledWith("AM-123", {
        assignee: { accountId: "user-123" },
      });
      expect(hooks.emit).toHaveBeenCalledWith("jira:issue.assigned", {
        issueId: "AM-123",
        from: undefined,
        to: "user-123",
      });
    });

    it("assigns to specific accountId when provided", async () => {
      const mockClient = {
        editIssue: vi.fn().mockResolvedValue(undefined),
      } as unknown as AtlassianClient;

      const hooks = { on: vi.fn(), emit: vi.fn() } as any;
      const ctx = { hooks } as any;

      registerHookConsumers(ctx, mockClient);

      const handler = hooks.on.mock.calls.find(
        ([event]: [string, (...args: unknown[]) => unknown]) => event === "jira:assign.requested",
      )![1];

      await handler({
        issueId: "AM-123",
        assignee: "other-user-456",
      });

      expect(mockClient.editIssue).toHaveBeenCalledWith("AM-123", {
        assignee: { accountId: "other-user-456" },
      });
      expect(hooks.emit).toHaveBeenCalledWith("jira:issue.assigned", {
        issueId: "AM-123",
        from: undefined,
        to: "other-user-456",
      });
    });

    it("handles API error gracefully", async () => {
      const mockClient = {
        getCurrentUser: vi.fn().mockRejectedValue(new Error("API error")),
      } as unknown as AtlassianClient;

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const hooks = { on: vi.fn(), emit: vi.fn() } as any;
      const ctx = { hooks } as any;

      registerHookConsumers(ctx, mockClient);

      const handler = hooks.on.mock.calls.find(
        ([event]: [string, (...args: unknown[]) => unknown]) => event === "jira:assign.requested",
      )![1];

      await handler({
        issueId: "AM-123",
        assignee: "self",
      });

      expect(hooks.emit).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("Failed to assign AM-123"),
        expect.any(Error),
      );

      consoleError.mockRestore();
    });
  });
});
