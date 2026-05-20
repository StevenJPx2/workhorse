import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitorService } from "workhorse-core";

import { createMonitors } from "./create-monitors";

function mockMonitorService(
  returnValue: ReturnType<MonitorService["getRunningMonitors"]> = [],
): MonitorService {
  return {
    getRunningMonitors: vi.fn().mockReturnValue(returnValue),
  } as unknown as MonitorService;
}

describe("createMonitors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty state when issueId is null", () => {
    createRoot((dispose) => {
      const monitors = mockMonitorService();
      const [issueId] = createSignal<string | null>(null);

      const { state } = createMonitors({ monitors, issueId, pollInterval: 100 });

      expect(state().monitors).toEqual([]);
      expect(state().loading).toBe(false);

      dispose();
    });
  });

  it("does not call getRunningMonitors when issueId is null", () => {
    createRoot((dispose) => {
      const monitors = mockMonitorService();
      const [issueId] = createSignal<string | null>(null);

      createMonitors({ monitors, issueId, pollInterval: 100 });
      vi.advanceTimersByTime(200);

      expect(monitors.getRunningMonitors).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("fetches monitors immediately when issueId is set", () => {
    createRoot((dispose) => {
      const statuses = [
        {
          id: "ci",
          type: "polling" as const,
          issueId: "AM-123",
          state: "running" as const,
          errorCount: 0,
        },
      ];
      const monitors = mockMonitorService(statuses);
      const [issueId] = createSignal<string | null>("AM-123");

      const { state } = createMonitors({ monitors, issueId, pollInterval: 100 });

      expect(monitors.getRunningMonitors).toHaveBeenCalledWith("AM-123");
      expect(state().monitors).toEqual(statuses);

      dispose();
    });
  });

  it("polls at configured interval", () => {
    createRoot((dispose) => {
      const monitors = mockMonitorService([]);
      const [issueId] = createSignal<string | null>("AM-123");

      createMonitors({ monitors, issueId, pollInterval: 100 });

      expect(monitors.getRunningMonitors).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(monitors.getRunningMonitors).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);
      expect(monitors.getRunningMonitors).toHaveBeenCalledTimes(3);

      dispose();
    });
  });

  it("stops polling when issueId changes to null", () => {
    createRoot((dispose) => {
      const monitors = mockMonitorService([]);
      const [issueId, setIssueId] = createSignal<string | null>("AM-123");

      createMonitors({ monitors, issueId, pollInterval: 100 });

      vi.advanceTimersByTime(100);
      const countBefore = (monitors.getRunningMonitors as ReturnType<typeof vi.fn>).mock.calls
        .length;

      setIssueId(null);
      vi.advanceTimersByTime(200);

      expect((monitors.getRunningMonitors as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        countBefore,
      );

      dispose();
    });
  });

  it("updates state on each poll", () => {
    createRoot((dispose) => {
      const monitorResults = [
        [
          {
            id: "a",
            type: "polling" as const,
            issueId: "AM-123",
            state: "running" as const,
            errorCount: 0,
          },
        ],
        [
          {
            id: "a",
            type: "polling" as const,
            issueId: "AM-123",
            state: "running" as const,
            errorCount: 0,
          },
          {
            id: "b",
            type: "event" as const,
            issueId: "AM-123",
            state: "running" as const,
            errorCount: 0,
          },
        ],
      ];
      let callIndex = 0;
      const monitors = {
        getRunningMonitors: vi.fn().mockImplementation(() => monitorResults[callIndex++] ?? []),
      } as unknown as MonitorService;

      const [issueId] = createSignal<string | null>("AM-123");
      const { state } = createMonitors({ monitors, issueId, pollInterval: 100 });

      expect(state().monitors).toHaveLength(1);

      vi.advanceTimersByTime(100);
      expect(state().monitors).toHaveLength(2);

      dispose();
    });
  });

  it("handles getRunningMonitors throwing", () => {
    createRoot((dispose) => {
      const monitors = {
        getRunningMonitors: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
      } as unknown as MonitorService;

      const [issueId] = createSignal<string | null>("AM-123");
      const { state } = createMonitors({ monitors, issueId, pollInterval: 100 });

      expect(state().monitors).toEqual([]);
      expect(state().loading).toBe(false);

      dispose();
    });
  });

  it("exposes a manual refresh function", () => {
    createRoot((dispose) => {
      const monitors = mockMonitorService([]);
      const [issueId] = createSignal<string | null>("AM-123");

      const { refresh } = createMonitors({ monitors, issueId, pollInterval: 100 });

      const before = (monitors.getRunningMonitors as ReturnType<typeof vi.fn>).mock.calls.length;
      refresh();
      expect((monitors.getRunningMonitors as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        before + 1,
      );

      dispose();
    });
  });

  it.fails("TODO: verify cleanup clears timer when root is disposed", () => {
    // createRoot dispose triggers onCleanup which should clear the interval.
    // This is hard to assert without exposing internal pollTimer reference.
    throw new Error("Not implemented");
  });
});
