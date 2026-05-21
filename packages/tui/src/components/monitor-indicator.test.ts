import { describe, expect, it } from "vitest";

import { getMonitorDisplayInfo } from "../primitives/monitor-display";

function makeStatus(
  overrides: {
    id?: string;
    type?: "polling" | "event";
    state?: "running" | "stopped" | "error";
    errorCount?: number;
  } = {},
) {
  return {
    id: overrides.id ?? "test",
    type: overrides.type ?? "polling",
    issueId: "AM-123",
    state: overrides.state ?? "running",
    errorCount: overrides.errorCount ?? 0,
  };
}

describe("getMonitorDisplayInfo", () => {
  it("returns null when no monitors are running", () => {
    const result = getMonitorDisplayInfo({ monitors: [], loading: false });
    expect(result).toBeNull();
  });

  it("returns count and no errors for a healthy monitor", () => {
    const result = getMonitorDisplayInfo({
      monitors: [makeStatus({ id: "ci", type: "polling" })],
      loading: false,
    });
    expect(result).toEqual({
      count: 1,
      hasErrors: false,
      pollingCount: 1,
      eventCount: 0,
    });
  });

  it("detects errors when any monitor has error state", () => {
    const result = getMonitorDisplayInfo({
      monitors: [
        makeStatus({ id: "a", state: "running" }),
        makeStatus({ id: "b", state: "error", errorCount: 3 }),
      ],
      loading: false,
    });
    expect(result?.hasErrors).toBe(true);
  });

  it("detects errors from errorCount even if state is running", () => {
    const result = getMonitorDisplayInfo({
      monitors: [makeStatus({ id: "a", state: "running", errorCount: 1 })],
      loading: false,
    });
    expect(result?.hasErrors).toBe(true);
  });

  it("breaks down polling vs event counts", () => {
    const result = getMonitorDisplayInfo({
      monitors: [
        makeStatus({ id: "p1", type: "polling" }),
        makeStatus({ id: "p2", type: "polling" }),
        makeStatus({ id: "e1", type: "event" }),
      ],
      loading: false,
    });
    expect(result?.pollingCount).toBe(2);
    expect(result?.eventCount).toBe(1);
    expect(result?.count).toBe(3);
  });

  it.fails(
    "TODO: test MonitorIndicator component rendering with opentui test renderer",
    () => {
      // Terminal UI components require a headless terminal context to render.
      // Extracted helper logic is covered above; component-level rendering
      // needs @opentui/solid test utilities which are not yet available.
      throw new Error("Not implemented");
    },
  );
});
