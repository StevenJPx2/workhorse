/**
 * Tests for Jira status sync — verifies correct hook emissions.
 */

import { describe, expect, it, vi } from "vitest";
import { registerStatusSync } from "../sync.ts";
import type { Issue } from "workhorse-core";

describe("registerStatusSync", () => {
  it("ignores non-jira issues", () => {
    const hooks = { on: vi.fn(), emit: vi.fn() } as any;
    const ctx = { hooks } as any;

    registerStatusSync(ctx);

    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    handler({
      issue: { source: "github", externalId: "123" } as Issue,
      from: "pending",
      to: "implementing",
    });

    expect(hooks.emit).not.toHaveBeenCalled();
  });

  it("emits jira:transition.requested on status change", () => {
    const hooks = { on: vi.fn(), emit: vi.fn() } as any;
    const ctx = { hooks } as any;

    registerStatusSync(ctx);

    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    handler({
      issue: { source: "jira", externalId: "AM-123" } as Issue,
      from: "pending",
      to: "done",
    });

    expect(hooks.emit).toHaveBeenCalledWith("jira:transition.requested", {
      issueId: "AM-123",
      targetStatus: "Done",
      fromStatus: "To Do",
    });
  });

  it("emits jira:assign.requested when transitioning to planning", () => {
    const hooks = { on: vi.fn(), emit: vi.fn() } as any;
    const ctx = { hooks } as any;

    registerStatusSync(ctx);

    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    handler({
      issue: { source: "jira", externalId: "AM-123" } as Issue,
      from: "queued",
      to: "planning",
    });

    // Should emit both transition and assign requests
    expect(hooks.emit).toHaveBeenCalledWith("jira:transition.requested", {
      issueId: "AM-123",
      targetStatus: "In Progress",
      fromStatus: "To Do",
    });
    expect(hooks.emit).toHaveBeenCalledWith("jira:assign.requested", {
      issueId: "AM-123",
      assignee: "self",
    });
  });

  it("does not emit assign request for non-planning status changes", () => {
    const hooks = { on: vi.fn(), emit: vi.fn() } as any;
    const ctx = { hooks } as any;

    registerStatusSync(ctx);

    const handler = hooks.on.mock.calls.find(
      ([event]: [string, (...args: unknown[]) => unknown]) => event === "issue.status_changed",
    )![1];

    handler({
      issue: { source: "jira", externalId: "AM-123" } as Issue,
      from: "planning",
      to: "implementing",
    });

    // Should only emit transition, not assign
    expect(hooks.emit).toHaveBeenCalledTimes(1);
    expect(hooks.emit).toHaveBeenCalledWith("jira:transition.requested", {
      issueId: "AM-123",
      targetStatus: "In Progress",
      fromStatus: "In Progress",
    });
  });
});
