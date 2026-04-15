import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { DatabaseOperations } from "./types.ts";
import type { Ticket, TicketStatus } from "#types/ticket.ts";
import type { SpawnResult, StopResult } from "../agent/orchestrator/types.ts";

// Mock the orchestrator module
const mockSpawnAgent = mock<(options: any) => Promise<SpawnResult>>();
const mockStopAgent =
  mock<(ticketId: string, repoPath: string, removeWorktree: boolean) => Promise<StopResult>>();
const mockGetAgent = mock<(ticketId: string) => any>();

mock.module("../agent/orchestrator/index.ts", () => ({
  spawnAgent: mockSpawnAgent,
  stopAgent: mockStopAgent,
  getAgent: mockGetAgent,
}));

// Import after mocking
const { launchTicketAgent, haltTicketAgent, restartTicketAgent, resumeAllTicketAgents } =
  await import("./ticket-agent/index.ts");

// Mock ticket data
const mockTicket: Ticket = {
  id: "AM-123",
  jira_key: "AM-123",
  rig: "github.com/test/repo",
  summary: "Test ticket",
  status: "pending",
  agent: "opencode",
  worktree_path: null,
  branch_name: null,
  jira_url: "https://test.atlassian.net/browse/AM-123",
  agent_pid: null,
  last_jira_sync: null,
  pr_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Create mock implementations
function createMockDb(tickets: Map<string, Ticket> = new Map()): DatabaseOperations {
  const events: Array<{ ticket_id: string; event_type: string; payload: object }> = [];

  return {
    getTicketById: (id) => tickets.get(id) ?? null,
    getAllTickets: () => Array.from(tickets.values()),
    updateTicketStatus: (id, status) => {
      const ticket = tickets.get(id);
      if (ticket) {
        ticket.status = status;
      }
    },
    updateTicket: (id, updates) => {
      const ticket = tickets.get(id);
      if (ticket) {
        Object.assign(ticket, updates);
      }
    },
    insertTicketEvent: (event) => {
      events.push(event);
    },
  };
}

beforeEach(() => {
  // Reset all mocks before each test
  mockSpawnAgent.mockClear();
  mockStopAgent.mockClear();
  mockGetAgent.mockClear();

  // Reset to default implementations
  mockSpawnAgent.mockImplementation((options: any) =>
    Promise.resolve({
      success: true,
      instance: {
        ticketId: options.ticketId,
        agentType: options.agentType,
        state: "running" as const,
        worktree: {
          path: `/worktrees/${options.ticketId}`,
          branch: `feat/${options.ticketId}`,
          ticketId: options.ticketId,
          head: "abc123",
        },
        session: null,
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        lastHealthCheck: null,
      },
    }),
  );
  mockStopAgent.mockImplementation(() => Promise.resolve({ success: true }));
  mockGetAgent.mockImplementation(() => null);
});

describe("launchTicketAgent", () => {
  test("successfully launches an agent", async () => {
    const tickets = new Map([[mockTicket.id, { ...mockTicket }]]);
    const db = createMockDb(tickets);

    const result = await launchTicketAgent(
      {
        ticketId: mockTicket.id,
        agentType: "opencode",
        issueType: "Task",
        summary: "Test",
        repoPath: "/repo",
      },
      db,
    );

    expect(result.success).toBe(true);
    expect(result.ticket).not.toBeNull();
    expect(result.ticket?.status).toBe("planning");
    expect(result.ticket?.worktree_path).toBe(`/worktrees/${mockTicket.id}`);
    expect(mockSpawnAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: mockTicket.id,
        agentType: "opencode",
      }),
    );
  });

  test("returns error if ticket not found", async () => {
    const db = createMockDb();

    const result = await launchTicketAgent(
      {
        ticketId: "MISSING-1",
        agentType: "opencode",
        issueType: "Task",
        repoPath: "/repo",
      },
      db,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ticket not found");
    expect(mockSpawnAgent).not.toHaveBeenCalled();
  });

  test("reverts status on spawn failure", async () => {
    const tickets = new Map([[mockTicket.id, { ...mockTicket }]]);
    const db = createMockDb(tickets);

    mockSpawnAgent.mockImplementation(() =>
      Promise.resolve({ success: false, error: "Spawn failed" }),
    );

    const result = await launchTicketAgent(
      {
        ticketId: mockTicket.id,
        agentType: "opencode",
        issueType: "Task",
        repoPath: "/repo",
      },
      db,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Spawn failed");
    // Status should be reverted to pending
    expect(tickets.get(mockTicket.id)?.status).toBe("pending");
  });
});

describe("haltTicketAgent", () => {
  test("successfully halts an agent", async () => {
    const ticket = { ...mockTicket, status: "implementing" as TicketStatus };
    const tickets = new Map([[ticket.id, ticket]]);
    const db = createMockDb(tickets);

    const result = await haltTicketAgent(ticket.id, "/repo", db);

    expect(result.success).toBe(true);
    expect(tickets.get(ticket.id)?.status).toBe("pending");
    expect(mockStopAgent).toHaveBeenCalledWith(ticket.id, "/repo", false);
  });

  test("passes removeWorktree option", async () => {
    const ticket = { ...mockTicket, status: "implementing" as TicketStatus };
    const tickets = new Map([[ticket.id, ticket]]);
    const db = createMockDb(tickets);

    await haltTicketAgent(ticket.id, "/repo", db, { removeWorktree: true });

    expect(mockStopAgent).toHaveBeenCalledWith(ticket.id, "/repo", true);
  });

  test("returns error on stop failure", async () => {
    const tickets = new Map([[mockTicket.id, { ...mockTicket }]]);
    const db = createMockDb(tickets);

    mockStopAgent.mockImplementation(() =>
      Promise.resolve({ success: false, error: "Stop failed" }),
    );

    const result = await haltTicketAgent(mockTicket.id, "/repo", db);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Stop failed");
  });
});

describe("restartTicketAgent", () => {
  test("restarts a non-running agent", async () => {
    const tickets = new Map([[mockTicket.id, { ...mockTicket }]]);
    const db = createMockDb(tickets);

    // Agent is not running
    mockGetAgent.mockImplementation(() => null);

    const result = await restartTicketAgent(mockTicket.id, "/repo", db);

    expect(result.success).toBe(true);
    expect(mockStopAgent).not.toHaveBeenCalled();
    expect(mockSpawnAgent).toHaveBeenCalled();
  });

  test("stops running agent before restart", async () => {
    const tickets = new Map([[mockTicket.id, { ...mockTicket }]]);
    const db = createMockDb(tickets);

    // Agent is running
    mockGetAgent.mockImplementation(() => ({
      ticketId: mockTicket.id,
      state: "running",
    }));

    const result = await restartTicketAgent(mockTicket.id, "/repo", db);

    expect(result.success).toBe(true);
    expect(mockStopAgent).toHaveBeenCalledWith(mockTicket.id, "/repo", false);
    expect(mockSpawnAgent).toHaveBeenCalled();
  });

  test("returns error if ticket not found", async () => {
    const db = createMockDb();

    const result = await restartTicketAgent("MISSING-1", "/repo", db);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ticket not found");
  });
});

describe("resumeAllTicketAgents", () => {
  test("resumes all active tickets", async () => {
    const tickets = new Map([
      ["AM-1", { ...mockTicket, id: "AM-1", jira_key: "AM-1", status: "planning" as TicketStatus }],
      [
        "AM-2",
        { ...mockTicket, id: "AM-2", jira_key: "AM-2", status: "implementing" as TicketStatus },
      ],
      ["AM-3", { ...mockTicket, id: "AM-3", jira_key: "AM-3", status: "pending" as TicketStatus }],
    ]);
    const db = createMockDb(tickets);

    // No agents running
    mockGetAgent.mockImplementation(() => null);

    const resumed = await resumeAllTicketAgents("/repo", db);

    // Should resume AM-1 and AM-2 (planning, implementing), not AM-3 (pending)
    expect(resumed).toBe(2);
    expect(mockSpawnAgent).toHaveBeenCalledTimes(2);
  });

  test("skips already running tickets", async () => {
    const tickets = new Map([
      ["AM-1", { ...mockTicket, id: "AM-1", jira_key: "AM-1", status: "planning" as TicketStatus }],
      [
        "AM-2",
        { ...mockTicket, id: "AM-2", jira_key: "AM-2", status: "implementing" as TicketStatus },
      ],
    ]);
    const db = createMockDb(tickets);

    // AM-1 is already running
    mockGetAgent.mockImplementation((ticketId: string) => {
      if (ticketId === "AM-1") {
        return { ticketId: "AM-1", state: "running" };
      }
      return null;
    });

    const resumed = await resumeAllTicketAgents("/repo", db);

    expect(resumed).toBe(2); // Both count as "resumed"
    // Only AM-2 should be spawned (AM-1 is already running)
    expect(mockSpawnAgent).toHaveBeenCalledTimes(1);
    expect(mockSpawnAgent).toHaveBeenCalledWith(expect.objectContaining({ ticketId: "AM-2" }));
  });
});
