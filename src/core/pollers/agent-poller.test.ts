/**
 * Tests for agent-poller
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createAgentPoller } from "./agent-poller.ts";

// Mock checkAgentHealth
const mockCheckAgentHealth = mock(() =>
  Promise.resolve({ healthy: true, sessionExists: true, lastOutput: "output" }),
);

mock.module("../agent/orchestrator/orchestrator.ts", () => ({
  checkAgentHealth: mockCheckAgentHealth,
}));

describe("createAgentPoller", () => {
  beforeEach(() => {
    mockCheckAgentHealth.mockClear();
    mockCheckAgentHealth.mockImplementation(() =>
      Promise.resolve({ healthy: true, sessionExists: true, lastOutput: "output" }),
    );
  });

  it("should create poller in idle state", () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 1000,
      autoStart: false,
    });

    expect(poller.state).toBe("idle");
  });

  it("should start polling when start() called", async () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(poller.state).toBe("running");
    expect(mockCheckAgentHealth).toHaveBeenCalledWith("TEST-123");

    poller.stop();
  });

  it("should stop polling when stop() called", async () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    poller.stop();
    expect(poller.state).toBe("stopped");
  });

  it("should auto-start when autoStart is true", async () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(poller.state).toBe("running");
    expect(mockCheckAgentHealth).toHaveBeenCalled();

    poller.stop();
  });

  it("should not restart if already running", async () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const callsBefore = mockCheckAgentHealth.mock.calls.length;

    // Call start again
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not have been called again for the second start
    expect(mockCheckAgentHealth.mock.calls.length).toBe(callsBefore);

    poller.stop();
  });

  it("should poll and return result", async () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    const result = await poller.poll();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.healthy).toBe(true);
    expect(result.data?.ticketId).toBe("TEST-123");
    expect(result.timestamp).toBeTruthy();
  });

  it("should track lastResult", async () => {
    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    expect(poller.lastResult()).toBeNull();

    await poller.poll();

    expect(poller.lastResult()).toBeDefined();
    expect(poller.lastResult()?.success).toBe(true);
  });

  it("should handle poll errors gracefully", async () => {
    mockCheckAgentHealth.mockImplementation(() => Promise.reject(new Error("Health check failed")));
    const onError = mock(() => {});

    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
      onError,
    });

    const result = await poller.poll();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Health check failed");
    expect(onError).toHaveBeenCalled();
    expect(poller.state).toBe("error");
  });

  it("should call onUnhealthy when agent becomes unhealthy", async () => {
    const onUnhealthy = mock(() => {});

    mockCheckAgentHealth
      .mockImplementationOnce(() =>
        Promise.resolve({ healthy: true, sessionExists: true, lastOutput: "" }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ healthy: false, sessionExists: true, lastOutput: "" }),
      );

    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
      onUnhealthy,
    });

    await poller.poll(); // First: healthy (sets wasHealthy = true)
    await poller.poll(); // Second: unhealthy (triggers callback)

    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    const firstCall = (onUnhealthy.mock.calls as unknown as Array<[{ healthy: boolean }]>)[0];
    expect(firstCall[0].healthy).toBe(false);
  });

  it("should call onHealthy when agent recovers", async () => {
    const onHealthy = mock(() => {});

    mockCheckAgentHealth
      .mockImplementationOnce(() =>
        Promise.resolve({ healthy: false, sessionExists: true, lastOutput: "" }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ healthy: true, sessionExists: true, lastOutput: "" }),
      );

    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
      onHealthy,
    });

    await poller.poll(); // First: unhealthy
    await poller.poll(); // Second: healthy (triggers callback)

    expect(onHealthy).toHaveBeenCalledTimes(1);
    const firstCall = (onHealthy.mock.calls as unknown as Array<[{ healthy: boolean }]>)[0];
    expect(firstCall[0].healthy).toBe(true);
  });

  it("should not call health callbacks on first poll", async () => {
    const onHealthy = mock(() => {});
    const onUnhealthy = mock(() => {});

    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
      onHealthy,
      onUnhealthy,
    });

    await poller.poll();

    expect(onHealthy).not.toHaveBeenCalled();
    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it("should handle non-Error throws", async () => {
    mockCheckAgentHealth.mockImplementation(() => Promise.reject("string error"));

    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    const result = await poller.poll();

    expect(result.success).toBe(false);
    expect(result.error).toBe("string error");
  });

  it("should include sessionExists in poll result", async () => {
    mockCheckAgentHealth.mockImplementation(() =>
      Promise.resolve({ healthy: false, sessionExists: false, lastOutput: "" }),
    );

    const poller = createAgentPoller({
      ticketId: "TEST-123",
      interval: 5000,
      autoStart: false,
    });

    const result = await poller.poll();

    expect(result.data?.sessionExists).toBe(false);
  });
});
