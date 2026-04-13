/**
 * Tests for useTickets hook
 */

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { useTickets } from "./use-tickets.ts";
import {
  initDatabase,
  closeDatabase,
  resetDatabaseRef,
  deleteTicket,
  getAllTickets,
} from "#core/db/index.ts";

describe("useTickets", () => {
  const testRig = "github.com/test/repo-" + Date.now();

  beforeEach(() => {
    // Initialize fresh database for each test
    closeDatabase();
    resetDatabaseRef();
    initDatabase();
  });

  afterEach(() => {
    // Clean up test tickets
    try {
      const allTickets = getAllTickets();
      for (const ticket of allTickets) {
        if (ticket.rig === testRig) {
          deleteTicket(ticket.id);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
    closeDatabase();
    resetDatabaseRef();
  });

  describe("initial state", () => {
    it("should start with empty tickets", () => {
      createRoot((dispose) => {
        const { tickets, isLoading, error } = useTickets();
        expect(tickets()).toEqual([]);
        expect(isLoading()).toBe(false);
        expect(error()).toBeNull();
        dispose();
      });
    });

    it("should auto-load when autoLoad is true", () => {
      createRoot((dispose) => {
        const { tickets, isLoading } = useTickets({
          rig: testRig,
          autoLoad: true,
        });
        // After auto-load, should have completed loading
        expect(isLoading()).toBe(false);
        expect(Array.isArray(tickets())).toBe(true);
        dispose();
      });
    });
  });

  describe("create", () => {
    it("should create a new ticket", () => {
      createRoot((dispose) => {
        const { create, tickets, reload } = useTickets({ rig: testRig });

        const ticket = create({
          jiraKey: "TEST-001",
          rig: testRig,
          summary: "Test ticket",
        });

        expect(ticket.id).toBe("TEST-001");
        expect(ticket.jira_key).toBe("TEST-001");
        expect(ticket.rig).toBe(testRig);
        expect(ticket.summary).toBe("Test ticket");
        expect(ticket.status).toBe("pending");

        // Should be in the tickets list after reload
        reload();
        expect(tickets().length).toBe(1);
        expect(tickets()[0].id).toBe("TEST-001");

        dispose();
      });
    });

    it("should call onChange callback", () => {
      createRoot((dispose) => {
        const onChange = mock(() => {});
        const { create } = useTickets({ rig: testRig, onChange });

        create({
          jiraKey: "TEST-002",
          rig: testRig,
        });

        expect(onChange).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("get", () => {
    it("should get ticket by id", () => {
      createRoot((dispose) => {
        const { create, get } = useTickets({ rig: testRig });

        create({
          jiraKey: "TEST-003",
          rig: testRig,
          summary: "Get test",
        });

        const ticket = get("TEST-003");
        expect(ticket).not.toBeNull();
        expect(ticket?.summary).toBe("Get test");

        dispose();
      });
    });

    it("should return null for non-existent ticket", () => {
      createRoot((dispose) => {
        const { get } = useTickets({ rig: testRig });

        const ticket = get("NON-EXISTENT");
        expect(ticket).toBeNull();

        dispose();
      });
    });
  });

  describe("setStatus", () => {
    it("should update ticket status", () => {
      createRoot((dispose) => {
        const { create, get, setStatus } = useTickets({ rig: testRig });

        create({
          jiraKey: "TEST-004",
          rig: testRig,
        });

        setStatus("TEST-004", "implementing");

        const ticket = get("TEST-004");
        expect(ticket?.status).toBe("implementing");

        dispose();
      });
    });
  });

  describe("update", () => {
    it("should update ticket fields", () => {
      createRoot((dispose) => {
        const { create, get, update } = useTickets({ rig: testRig });

        create({
          jiraKey: "TEST-005",
          rig: testRig,
        });

        update("TEST-005", {
          summary: "Updated summary",
          worktreePath: "/path/to/worktree",
          branchName: "feat/TEST-005",
        });

        const ticket = get("TEST-005");
        expect(ticket?.summary).toBe("Updated summary");
        expect(ticket?.worktree_path).toBe("/path/to/worktree");
        expect(ticket?.branch_name).toBe("feat/TEST-005");

        dispose();
      });
    });

    it("should handle partial updates", () => {
      createRoot((dispose) => {
        const { create, get, update } = useTickets({ rig: testRig });

        create({
          jiraKey: "TEST-006",
          rig: testRig,
          summary: "Original",
        });

        update("TEST-006", {
          prUrl: "https://github.com/pr/123",
        });

        const ticket = get("TEST-006");
        expect(ticket?.summary).toBe("Original"); // Unchanged
        expect(ticket?.pr_url).toBe("https://github.com/pr/123");

        dispose();
      });
    });
  });

  describe("remove", () => {
    it("should delete ticket", () => {
      createRoot((dispose) => {
        const { create, get, remove, tickets, reload } = useTickets({
          rig: testRig,
        });

        create({
          jiraKey: "TEST-007",
          rig: testRig,
        });

        reload();
        expect(tickets().length).toBe(1);

        remove("TEST-007");

        expect(get("TEST-007")).toBeNull();
        expect(tickets().length).toBe(0);

        dispose();
      });
    });
  });

  describe("findByStatus", () => {
    it("should filter tickets by status", () => {
      createRoot((dispose) => {
        const { create, setStatus, findByStatus, reload } = useTickets({
          rig: testRig,
        });

        create({ jiraKey: "TEST-008", rig: testRig });
        create({ jiraKey: "TEST-009", rig: testRig });
        create({ jiraKey: "TEST-010", rig: testRig });

        setStatus("TEST-008", "implementing");
        setStatus("TEST-009", "implementing");

        reload();

        const implementing = findByStatus("implementing");
        const pending = findByStatus("pending");

        expect(implementing.length).toBe(2);
        expect(pending.length).toBe(1);

        dispose();
      });
    });
  });

  describe("reload", () => {
    it("should refresh tickets from database", () => {
      createRoot((dispose) => {
        const { create, tickets, reload } = useTickets({ rig: testRig });

        expect(tickets().length).toBe(0);

        create({ jiraKey: "TEST-011", rig: testRig });
        create({ jiraKey: "TEST-012", rig: testRig });

        reload();

        expect(tickets().length).toBe(2);

        dispose();
      });
    });
  });

  describe("rig filtering", () => {
    it("should only load tickets for specified rig", () => {
      createRoot((dispose) => {
        const otherRig = "github.com/other/repo-" + Date.now();
        const { create: create1 } = useTickets({ rig: testRig });
        const { create: create2 } = useTickets({ rig: otherRig });

        create1({ jiraKey: "TEST-013", rig: testRig });
        create2({ jiraKey: "TEST-014", rig: otherRig });

        // Query only for testRig
        const { tickets, reload: _reload } = useTickets({
          rig: testRig,
          autoLoad: true,
        });

        expect(tickets().length).toBe(1);
        expect(tickets()[0].rig).toBe(testRig);

        // Cleanup other rig ticket
        deleteTicket("TEST-014");

        dispose();
      });
    });

    it("should support reactive rig option (Accessor)", () => {
      createRoot((dispose) => {
        const timestamp = Date.now();
        const otherRig = "github.com/other/repo-reactive-" + timestamp;
        const [currentRig, setCurrentRig] = createSignal<string | undefined>(undefined);

        // Create tickets in different rigs with unique IDs
        const { create: create1 } = useTickets({ rig: testRig });
        const { create: create2 } = useTickets({ rig: otherRig });

        const id1 = `TEST-R01-${timestamp}`;
        const id2 = `TEST-R02-${timestamp}`;

        create1({ jiraKey: id1, rig: testRig });
        create2({ jiraKey: id2, rig: otherRig });

        // Use reactive rig option
        const { tickets, reload } = useTickets({
          rig: currentRig,
          autoLoad: false,
        });

        // Initially rig is undefined, should load all tickets
        reload();
        expect(tickets().length).toBeGreaterThanOrEqual(2);

        // Update rig to testRig
        setCurrentRig(testRig);
        reload();
        expect(tickets().length).toBe(1);
        expect(tickets()[0].rig).toBe(testRig);

        // Update rig to otherRig
        setCurrentRig(otherRig);
        reload();
        expect(tickets().length).toBe(1);
        expect(tickets()[0].rig).toBe(otherRig);

        // Cleanup
        deleteTicket(id2);

        dispose();
      });
    });
  });

  describe("error handling", () => {
    it("should set error when create fails with duplicate key", () => {
      createRoot((dispose) => {
        const { create, error } = useTickets({ rig: testRig });

        // First create should succeed
        create({ jiraKey: "TEST-DUP-001", rig: testRig });

        // Second create with same key should fail due to duplicate key constraint
        expect(() => {
          create({ jiraKey: "TEST-DUP-001", rig: testRig });
        }).toThrow();

        expect(error()).not.toBeNull();

        dispose();
      });
    });
  });

  describe("update with all field types", () => {
    it("should update agent and agentPid fields", () => {
      createRoot((dispose) => {
        const { create, get, update } = useTickets({ rig: testRig });

        create({ jiraKey: "TEST-AGENT-001", rig: testRig });

        update("TEST-AGENT-001", {
          agent: "claude",
          agentPid: 12345,
        });

        const ticket = get("TEST-AGENT-001");
        expect(ticket?.agent).toBe("claude");
        expect(ticket?.agent_pid).toBe(12345);

        // Test setting agentPid to null
        update("TEST-AGENT-001", {
          agentPid: null,
        });

        const updatedTicket = get("TEST-AGENT-001");
        expect(updatedTicket?.agent_pid).toBeNull();

        dispose();
      });
    });

    it("should update prUrl to null", () => {
      createRoot((dispose) => {
        const { create, get, update } = useTickets({ rig: testRig });

        create({ jiraKey: "TEST-PR-001", rig: testRig });

        update("TEST-PR-001", {
          prUrl: "https://github.com/pr/123",
        });

        let ticket = get("TEST-PR-001");
        expect(ticket?.pr_url).toBe("https://github.com/pr/123");

        // Set to null
        update("TEST-PR-001", {
          prUrl: null,
        });

        ticket = get("TEST-PR-001");
        expect(ticket?.pr_url).toBeNull();

        dispose();
      });
    });

    it("should not update when no fields are provided", () => {
      createRoot((dispose) => {
        const onChange = mock(() => {});
        const { create, update } = useTickets({ rig: testRig, onChange });

        create({ jiraKey: "TEST-NOOP-001", rig: testRig });

        // Reset mock count after create
        const callCountAfterCreate = onChange.mock.calls.length;

        // Call update with empty object - should not trigger reload
        update("TEST-NOOP-001", {});

        // onChange should not be called again (no reload)
        expect(onChange.mock.calls.length).toBe(callCountAfterCreate);

        dispose();
      });
    });

    it("should update status via update method", () => {
      createRoot((dispose) => {
        const { create, get, update } = useTickets({ rig: testRig });

        create({ jiraKey: "TEST-STATUS-001", rig: testRig });

        update("TEST-STATUS-001", {
          status: "blocked",
        });

        const ticket = get("TEST-STATUS-001");
        expect(ticket?.status).toBe("blocked");

        dispose();
      });
    });
  });
});
