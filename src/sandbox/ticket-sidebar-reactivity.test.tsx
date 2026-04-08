/**
 * Functional snapshot tests for ticket sidebar reactivity
 *
 * Tests that tickets appear in sidebar after adding.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createRoot, createSignal, createMemo } from "solid-js";

// Mock database
const mockDb: Record<string, unknown> = {};

mock.module("../lib/db/index.ts", () => ({
  insertTicket: (data: { id: string; jira_key: string; rig: string; summary: string }) => {
    mockDb[data.id] = { ...data, status: "pending", jiraKey: data.jira_key };
    return mockDb[data.id];
  },
  getTicketById: (id: string) => mockDb[id] || null,
  getTicketsByRig: (rig: string) => Object.values(mockDb).filter((t: any) => t.rig === rig),
  getAllTickets: () => Object.values(mockDb),
  updateTicketStatus: () => {},
  deleteTicket: () => {},
  updateTicket: () => {},
}));

import { useTickets } from "../hooks/use-tickets/index.ts";

describe("ticket sidebar reactivity", () => {
  beforeEach(() => {
    // Clear mock database
    Object.keys(mockDb).forEach((key) => delete mockDb[key]);
  });

  describe("BUG: tickets not appearing after add", () => {
    it("REPRODUCER: tickets passed as unwrapped array don't update", async () => {
      await createRoot(async (dispose) => {
        const { create, tickets, reload } = useTickets({
          rig: "github.com/test/repo",
        });

        // Create first ticket
        create({
          jiraKey: "AM-123",
          rig: "github.com/test/repo",
          jiraUrl: "https://test.atlassian.net/browse/AM-123",
          summary: "Test ticket",
          agent: "opencode",
        });

        // Reload to get updated tickets
        reload();

        // At this point, tickets() should have 1 item
        const ticketList = tickets();
        expect(ticketList).toHaveLength(1);
        expect((ticketList[0] as any)?.jiraKey).toBe("AM-123");

        dispose();
      });
    });

    it("BUG: unwrapped tickets() called once doesn't react to changes", async () => {
      await createRoot(async (dispose) => {
        const { create, tickets } = useTickets({
          rig: "github.com/test/repo",
        });

        // Simulate what happens in App.tsx line 127:
        // tickets={tickets()} is called once and the array is captured
        const capturedTickets = tickets(); // This is the bug!

        // Add a ticket AFTER capturing
        create({
          jiraKey: "AM-789",
          rig: "github.com/test/repo",
          jiraUrl: "https://test.atlassian.net/browse/AM-789",
          summary: "Late ticket",
          agent: "opencode",
        });

        // The captured array is stale - doesn't include the new ticket
        expect(capturedTickets).toHaveLength(0); // Still 0, not 1!

        // But tickets() signal has the new ticket
        expect(tickets()).toHaveLength(1);
        expect((tickets()[0] as any)?.jiraKey).toBe("AM-789");

        dispose();
      });
    });
  });

  describe("FIX: passing signal accessor maintains reactivity", () => {
    it("should update when tickets change if accessor is passed", async () => {
      await createRoot(async (dispose) => {
        const { create, tickets } = useTickets({
          rig: "github.com/test/repo",
        });

        // Create a memo that reads from the tickets signal
        // This simulates what TicketSidebar now does with props.tickets()
        const ticketCount = createMemo(() => tickets().length);

        // Initial count should be 0
        expect(ticketCount()).toBe(0);

        // Add a ticket - this should trigger reactivity
        create({
          jiraKey: "AM-456",
          rig: "github.com/test/repo",
          jiraUrl: "https://test.atlassian.net/browse/AM-456",
          summary: "New ticket",
          agent: "claude",
        });

        // Memo should now return 1
        expect(ticketCount()).toBe(1);

        // Add another ticket
        create({
          jiraKey: "AM-999",
          rig: "github.com/test/repo",
          jiraUrl: "https://test.atlassian.net/browse/AM-999",
          summary: "Another ticket",
          agent: "opencode",
        });

        // Memo should now return 2
        expect(ticketCount()).toBe(2);

        dispose();
      });
    });

    it("FIX VERIFICATION: using accessor function updates correctly", async () => {
      await createRoot(async (dispose) => {
        const { create, tickets } = useTickets({
          rig: "github.com/test/repo",
        });

        // Track all values seen
        const seenValues: number[] = [];

        // Create an effect that tracks the tickets length
        createMemo(() => {
          const len = tickets().length;
          seenValues.push(len);
          return len;
        });

        // Initially should have tracked 0
        expect(seenValues).toContain(0);

        // Add first ticket
        create({
          jiraKey: "TICKET-1",
          rig: "github.com/test/repo",
          jiraUrl: "https://test.atlassian.net/browse/TICKET-1",
          summary: "First",
          agent: "opencode",
        });

        // Should now see 1
        expect(tickets()).toHaveLength(1);

        // Add second ticket
        create({
          jiraKey: "TICKET-2",
          rig: "github.com/test/repo",
          jiraUrl: "https://test.atlassian.net/browse/TICKET-2",
          summary: "Second",
          agent: "claude",
        });

        // Should now see 2
        expect(tickets()).toHaveLength(2);

        dispose();
      });
    });
  });

  describe("TicketSidebar prop types", () => {
    it("should accept Accessor<Ticket[]> type for tickets prop", async () => {
      await createRoot(async (dispose) => {
        const { tickets } = useTickets({
          rig: "github.com/test/repo",
        });

        // Verify tickets is a function (accessor)
        expect(typeof tickets).toBe("function");

        // Verify calling it returns an array
        const result = tickets();
        expect(Array.isArray(result)).toBe(true);

        dispose();
      });
    });
  });
});
