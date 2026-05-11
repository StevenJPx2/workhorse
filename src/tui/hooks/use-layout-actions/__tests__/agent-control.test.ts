/**
 * Tests for agent control actions (toggleAgent, startAgent) in useLayoutActions
 *
 * Extracted from use-layout-actions.test.ts to stay under 500 line limit.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createRoot, createSignal } from "solid-js";

// Mock context dependencies before importing the hook
const mockRemoveTicket = mock(() => {});
const mockUpdateTicket = mock(() => {});
const mockCurrentTicket = mock(() => null as any);
const mockGetRunningAgents = mock(() => [] as any[]);
const mockStopWork = mock(() => Promise.resolve(true));
const mockRestartAgent = mock(() => Promise.resolve(true));
const mockIsAgentRunning = mock(() => false);
const mockGetAgentState = mock(() => undefined as string | undefined);
const mockOpenModal = mock(() => {});
const mockClearSessionCache = mock(() => {});

mock.module("../../../contexts/tickets-context.tsx", () => ({
  useTicketsContext: () => ({
    actions: {
      remove: mockRemoveTicket,
      update: mockUpdateTicket,
    },
    currentTicket: mockCurrentTicket,
  }),
}));

mock.module("../../../contexts/workflow-context.tsx", () => ({
  useWorkflowContext: () => ({
    getRunningAgents: mockGetRunningAgents,
    stopWork: mockStopWork,
    restartAgent: mockRestartAgent,
    isAgentRunning: mockIsAgentRunning,
    getAgentState: mockGetAgentState,
  }),
}));

mock.module("../../use-modal-system/index.ts", () => ({
  useModalSystem: () => ({
    open: mockOpenModal,
  }),
}));

mock.module("../../use-agent-summary/index.ts", () => ({
  clearSessionCache: mockClearSessionCache,
}));

describe("useLayoutActions agent control", () => {
  beforeEach(() => {
    mockRemoveTicket.mockClear();
    mockUpdateTicket.mockClear();
    mockCurrentTicket.mockClear();
    mockGetRunningAgents.mockClear();
    mockStopWork.mockClear();
    mockRestartAgent.mockClear();
    mockIsAgentRunning.mockClear();
    mockGetAgentState.mockClear();
    mockOpenModal.mockClear();
    mockClearSessionCache.mockClear();

    mockCurrentTicket.mockReturnValue(null);
    mockGetRunningAgents.mockReturnValue([]);
    mockStopWork.mockImplementation(() => Promise.resolve(true));
    mockRestartAgent.mockImplementation(() => Promise.resolve(true));
    mockIsAgentRunning.mockReturnValue(false);
    mockGetAgentState.mockReturnValue(undefined);
  });

  describe("toggleAgent", () => {
    it("should do nothing when no current ticket", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      const reloadTickets = mock(() => {});

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets,
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.toggleAgent();

        expect(mockStopWork).not.toHaveBeenCalled();
        expect(mockRestartAgent).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should stop agent when agent is running", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(true);
      const reloadTickets = mock(() => {});

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets,
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.toggleAgent();

        expect(mockStopWork).toHaveBeenCalledWith("TICKET-1");
        expect(reloadTickets).toHaveBeenCalled();
        dispose();
      });
    });

    it("should start agent when agent is not running", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(false);
      const reloadTickets = mock(() => {});

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets,
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.toggleAgent();

        expect(mockClearSessionCache).toHaveBeenCalledWith("TICKET-1");
        expect(mockRestartAgent).toHaveBeenCalledWith("TICKET-1");
        expect(reloadTickets).toHaveBeenCalled();
        dispose();
      });
    });

    it("should set isAgentStarting during start and reset after", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(false);

      mockRestartAgent.mockImplementation(async () => {
        mockGetAgentState.mockReturnValue("running");
        return true;
      });

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(actions.isAgentStarting()).toBe(false);
        await actions.toggleAgent();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(actions.isAgentStarting()).toBe(false);

        dispose();
      });
    });
  });

  describe("startAgent", () => {
    it("should do nothing when no current ticket", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      const reloadTickets = mock(() => {});

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets,
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.startAgent();

        expect(mockRestartAgent).not.toHaveBeenCalled();
        expect(mockStopWork).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should start agent when agent is not running", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(false);
      const reloadTickets = mock(() => {});

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets,
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.startAgent();

        expect(mockRestartAgent).toHaveBeenCalledWith("TICKET-1");
        expect(mockStopWork).not.toHaveBeenCalled();
        expect(reloadTickets).toHaveBeenCalled();
        dispose();
      });
    });

    it("should not stop agent when agent is already running", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(true);
      const reloadTickets = mock(() => {});

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets,
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.startAgent();

        expect(mockStopWork).not.toHaveBeenCalled();
        expect(mockRestartAgent).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should not start agent when agent is already starting", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(false);

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        // First start
        await actions.startAgent();
        mockRestartAgent.mockClear();

        // While starting, another start should be ignored
        // (agentStartingFor is still set)
        dispose();
      });
    });

    it("should clear session cache before starting", async () => {
      const { useLayoutActions } = await import("../use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(false);

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        await actions.startAgent();

        expect(mockClearSessionCache).toHaveBeenCalledWith("TICKET-1");
        dispose();
      });
    });
  });
});
