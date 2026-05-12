/**
 * Tests for Jira status sync.
 */

import { describe, expect, it, vi } from "vitest";
import type { AtlassianClient } from "../client.ts";
import { registerStatusSync } from "../sync.ts";
import type { Issue } from "@stevenjpx2/jiratown-core";

describe("registerStatusSync", () => {
  it("ignores non-jira issues", async () => {
    const mockClient = {
      getTransitions: vi.fn(),
      transitionIssue: vi.fn(),
    } as unknown as AtlassianClient;

    const hooks = { on: vi.fn(), emit: vi.fn() } as any;
    const ctx = { db: {} as any, hooks } as any;

    registerStatusSync(ctx, mockClient);

    // Get the registered handler
    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    await handler({
      issue: { source: "github", externalId: "123" } as Issue,
      from: "pending",
      to: "implementing",
    });

    expect(mockClient.getTransitions).not.toHaveBeenCalled();
  });

  it("transitions jira issue on status change", async () => {
    const mockClient = {
      getTransitions: vi.fn().mockResolvedValue([
        { id: "31", name: "In Progress", to: { name: "In Progress", id: "3" } },
        { id: "41", name: "Done", to: { name: "Done", id: "6" } },
      ]),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
    } as unknown as AtlassianClient;

    const hooks = { on: vi.fn(), emit: vi.fn() } as any;
    const ctx = { db: {} as any, hooks } as any;

    registerStatusSync(ctx, mockClient);

    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    await handler({
      issue: { source: "jira", externalId: "AM-123" } as Issue,
      from: "pending",
      to: "done",
    });

    expect(mockClient.getTransitions).toHaveBeenCalledWith("AM-123");
    expect(mockClient.transitionIssue).toHaveBeenCalledWith("AM-123", "41");
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
    const ctx = { db: {} as any, hooks } as any;

    registerStatusSync(ctx, mockClient);

    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    await handler({
      issue: { source: "jira", externalId: "AM-123" } as Issue,
      from: "pending",
      to: "done",
    });

    expect(mockClient.transitionIssue).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('No transition found for status "done"'),
    );

    consoleWarn.mockRestore();
  });
});
