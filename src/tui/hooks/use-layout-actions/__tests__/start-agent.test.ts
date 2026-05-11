/**
 * Tests for doStartAgent helper
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { doStartAgent } from "../start-agent.ts";

describe("doStartAgent", () => {
  let mockRestartAgent: ReturnType<typeof mock>;
  let mockGetAgentState: ReturnType<typeof mock>;
  let mockReloadAgents: ReturnType<typeof mock>;
  let setAgentStartingFor: ReturnType<typeof mock>;
  let reloadTickets: ReturnType<typeof mock>;

  beforeEach(() => {
    mockRestartAgent = mock(() => Promise.resolve(true));
    mockGetAgentState = mock(() => undefined as string | undefined);
    mockReloadAgents = mock(() => {});
    setAgentStartingFor = mock(() => {});
    reloadTickets = mock(() => {});

    mock.module("../../use-agent-summary/index.ts", () => ({
      clearSessionCache: mock(() => {}),
    }));
  });

  function createDeps() {
    return {
      workflow: {
        restartAgent: mockRestartAgent,
        getAgentState: mockGetAgentState,
        reloadAgents: mockReloadAgents,
      } as any,
      setAgentStartingFor,
      reloadTickets,
    };
  }

  it("should set agent starting flag", async () => {
    await doStartAgent("TICKET-1", createDeps());

    expect(setAgentStartingFor).toHaveBeenCalledWith("TICKET-1");
  });

  it("should call restartAgent with ticket ID", async () => {
    await doStartAgent("TICKET-1", createDeps());

    expect(mockRestartAgent).toHaveBeenCalledWith("TICKET-1");
  });

  it("should reload tickets after start", async () => {
    await doStartAgent("TICKET-1", createDeps());

    expect(reloadTickets).toHaveBeenCalled();
  });

  it("should clear starting flag on error", async () => {
    mockRestartAgent.mockImplementation(() => Promise.reject(new Error("fail")));

    await doStartAgent("TICKET-1", createDeps());

    expect(setAgentStartingFor).toHaveBeenCalledWith(null);
    expect(reloadTickets).toHaveBeenCalled();
  });

  it("should poll for running state and clear starting flag", async () => {
    mockGetAgentState.mockReturnValue("running");

    await doStartAgent("TICKET-1", createDeps());

    // Wait for polling
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(setAgentStartingFor).toHaveBeenCalledWith(null);
  });

  it("should poll for crashed state and clear starting flag", async () => {
    mockGetAgentState.mockReturnValue("crashed");

    await doStartAgent("TICKET-1", createDeps());

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(setAgentStartingFor).toHaveBeenCalledWith(null);
  });

  it("should not clear starting flag while agent is in non-definitive state", async () => {
    mockGetAgentState.mockReturnValue("idle");

    await doStartAgent("TICKET-1", createDeps());

    // Wait a short time - not enough for 10 polls
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should NOT have called with null yet (still in starting state)
    const nullCalls = (setAgentStartingFor as ReturnType<typeof mock>).mock.calls.filter(
      (call: any[]) => call[0] === null,
    );
    expect(nullCalls.length).toBe(0);
  });
});
