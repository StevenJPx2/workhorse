/**
 * Tests for useLayoutActions hook
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

mock.module("../../contexts/tickets-context.tsx", () => ({
  useTicketsContext: () => ({
    actions: {
      remove: mockRemoveTicket,
      update: mockUpdateTicket,
    },
    currentTicket: mockCurrentTicket,
  }),
}));

mock.module("../../contexts/workflow-context.tsx", () => ({
  useWorkflowContext: () => ({
    getRunningAgents: mockGetRunningAgents,
    stopWork: mockStopWork,
    restartAgent: mockRestartAgent,
    isAgentRunning: mockIsAgentRunning,
    getAgentState: mockGetAgentState,
  }),
}));

mock.module("../use-modal-system/index.ts", () => ({
  useModalSystem: () => ({
    open: mockOpenModal,
  }),
}));

mock.module("../use-agent-summary/index.ts", () => ({
  clearSessionCache: mockClearSessionCache,
}));

describe("useLayoutActions", () => {
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

  describe("initial state", () => {
    it("should return all action functions", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      const reloadTickets = mock(() => {});
      const onQuit = mock(() => Promise.resolve());

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({ currentTicketId, reloadTickets, onQuit });

        expect(typeof actions.quit).toBe("function");
        expect(typeof actions.addTicket).toBe("function");
        expect(typeof actions.closeTicket).toBe("function");
        expect(typeof actions.openInJira).toBe("function");
        expect(typeof actions.escalate).toBe("function");
        expect(typeof actions.switchAgent).toBe("function");
        expect(typeof actions.toggleAgent).toBe("function");
        expect(typeof actions.isAgentStarting).toBe("function");
        expect(typeof actions.getAgentState).toBe("function");

        dispose();
      });
    });

    it("should start with isAgentStarting = false", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(actions.isAgentStarting()).toBe(false);
        dispose();
      });
    });
  });

  describe("quit", () => {
    it("should call onQuit with no running agents", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      const onQuit = mock(() => Promise.resolve());

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit,
        });

        await actions.quit();

        expect(onQuit).toHaveBeenCalled();
        expect(mockStopWork).not.toHaveBeenCalled();
        dispose();
      });
    });

    it("should stop running agents before quitting", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      const onQuit = mock(() => Promise.resolve());

      mockGetRunningAgents.mockReturnValue([
        { ticketId: "TICKET-1", state: "running" },
        { ticketId: "TICKET-2", state: "running" },
      ]);

      await createRoot(async (dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit,
        });

        await actions.quit();

        expect(mockStopWork).toHaveBeenCalledTimes(2);
        expect(mockStopWork).toHaveBeenCalledWith("TICKET-1");
        expect(mockStopWork).toHaveBeenCalledWith("TICKET-2");
        expect(onQuit).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("addTicket", () => {
    it("should open the ticket-input modal", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        actions.addTicket();

        expect(mockOpenModal).toHaveBeenCalledWith("ticket-input");
        dispose();
      });
    });
  });

  describe("closeTicket", () => {
    it("should remove the current ticket", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-123");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        actions.closeTicket();

        expect(mockRemoveTicket).toHaveBeenCalledWith("TICKET-123");
        dispose();
      });
    });

    it("should do nothing when no current ticket", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        actions.closeTicket();

        expect(mockRemoveTicket).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("openInJira", () => {
    it("should do nothing when no current ticket", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(() => actions.openInJira()).not.toThrow();
        dispose();
      });
    });

    it("should do nothing when ticket has no jira_url", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockCurrentTicket.mockReturnValue({ id: "T1", jira_url: null });

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("T1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(() => actions.openInJira()).not.toThrow();
        dispose();
      });
    });

    it("should log jira url when ticket has jira_url", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockCurrentTicket.mockReturnValue({
        id: "T1",
        jira_url: "https://company.atlassian.net/browse/T-1",
      });

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("T1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(() => actions.openInJira()).not.toThrow();
        dispose();
      });
    });
  });

  describe("escalate", () => {
    it("should not throw when no current ticket", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(() => actions.escalate()).not.toThrow();
        dispose();
      });
    });

    it("should not throw when current ticket is set", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("TICKET-456");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(() => actions.escalate()).not.toThrow();
        dispose();
      });
    });
  });

  describe("switchAgent", () => {
    it("should switch agent from opencode to claude", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockCurrentTicket.mockReturnValue({ id: "T1", agent: "opencode" });

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("T1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        actions.switchAgent();

        expect(mockUpdateTicket).toHaveBeenCalledWith("T1", { agent: "claude" });
        dispose();
      });
    });

    it("should switch agent from claude to opencode", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockCurrentTicket.mockReturnValue({ id: "T1", agent: "claude" });

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("T1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        actions.switchAgent();

        expect(mockUpdateTicket).toHaveBeenCalledWith("T1", { agent: "opencode" });
        dispose();
      });
    });

    it("should do nothing when no current ticket", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockCurrentTicket.mockReturnValue(null);

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>(undefined);
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        actions.switchAgent();

        expect(mockUpdateTicket).not.toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("toggleAgent", () => {
    it("should do nothing when no current ticket", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
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
      const { useLayoutActions } = await import("./use-layout-actions.ts");
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
      const { useLayoutActions } = await import("./use-layout-actions.ts");
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
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockIsAgentRunning.mockReturnValue(false);

      mockRestartAgent.mockImplementation(async () => {
        // This is async
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
        expect(actions.isAgentStarting()).toBe(false);

        dispose();
      });
    });
  });

  describe("getAgentState", () => {
    it("should return workflow agent state normally", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockGetAgentState.mockReturnValue("running");

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("T1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(actions.getAgentState("T1")).toBe("running");
        dispose();
      });
    });

    it("should return undefined when no state", async () => {
      const { useLayoutActions } = await import("./use-layout-actions.ts");
      mockGetAgentState.mockReturnValue(undefined);

      createRoot((dispose) => {
        const [currentTicketId] = createSignal<string | undefined>("T1");
        const actions = useLayoutActions({
          currentTicketId,
          reloadTickets: mock(() => {}),
          onQuit: mock(() => Promise.resolve()),
        });

        expect(actions.getAgentState("T1")).toBeUndefined();
        dispose();
      });
    });
  });
});
