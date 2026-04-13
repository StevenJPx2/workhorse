/**
 * Tests for ticket-updates.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase, resetDatabaseRef } from "./index.ts";
import { insertTicket } from "./tickets.ts";
import { updateTicket } from "./ticket-updates.ts";
import { getDatabase } from "./connection.ts";
import type { Ticket } from "#types/ticket.ts";

describe("ticket-updates", () => {
  const testRig = `github.com/test/updates-${Date.now()}`;

  beforeEach(() => {
    closeDatabase();
    resetDatabaseRef();
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    resetDatabaseRef();
  });

  function getTicket(id: string): Ticket | null {
    const db = getDatabase();
    return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as Ticket | null;
  }

  test("should update summary field", () => {
    insertTicket({
      id: "TEST-SUM-001",
      jira_key: "TEST-SUM-001",
      rig: testRig,
      summary: "Original summary",
    });

    updateTicket("TEST-SUM-001", { summary: "Updated summary" });

    const updated = getTicket("TEST-SUM-001");
    expect(updated?.summary).toBe("Updated summary");
  });

  test("should update jira_url field", () => {
    insertTicket({
      id: "TEST-URL-001",
      jira_key: "TEST-URL-001",
      rig: testRig,
    });

    updateTicket("TEST-URL-001", {
      jira_url: "https://jira.example.com/browse/TEST-URL-001",
    });

    const updated = getTicket("TEST-URL-001");
    expect(updated?.jira_url).toBe("https://jira.example.com/browse/TEST-URL-001");
  });

  test("should update worktree_path field", () => {
    insertTicket({
      id: "TEST-WT-001",
      jira_key: "TEST-WT-001",
      rig: testRig,
    });

    updateTicket("TEST-WT-001", {
      worktree_path: "/path/to/worktree",
    });

    const updated = getTicket("TEST-WT-001");
    expect(updated?.worktree_path).toBe("/path/to/worktree");
  });

  test("should update branch_name field", () => {
    insertTicket({
      id: "TEST-BR-001",
      jira_key: "TEST-BR-001",
      rig: testRig,
    });

    updateTicket("TEST-BR-001", {
      branch_name: "feat/TEST-BR-001",
    });

    const updated = getTicket("TEST-BR-001");
    expect(updated?.branch_name).toBe("feat/TEST-BR-001");
  });

  test("should update agent field", () => {
    insertTicket({
      id: "TEST-AGT-001",
      jira_key: "TEST-AGT-001",
      rig: testRig,
    });

    updateTicket("TEST-AGT-001", {
      agent: "claude",
    });

    const updated = getTicket("TEST-AGT-001");
    expect(updated?.agent).toBe("claude");
  });

  test("should update agent_pid field", () => {
    insertTicket({
      id: "TEST-PID-001",
      jira_key: "TEST-PID-001",
      rig: testRig,
    });

    updateTicket("TEST-PID-001", {
      agent_pid: 12345,
    });

    const updated = getTicket("TEST-PID-001");
    expect(updated?.agent_pid).toBe(12345);
  });

  test("should update agent_pid to null", () => {
    insertTicket({
      id: "TEST-PID-002",
      jira_key: "TEST-PID-002",
      rig: testRig,
    });

    updateTicket("TEST-PID-002", { agent_pid: 12345 });
    let updated = getTicket("TEST-PID-002");
    expect(updated?.agent_pid).toBe(12345);

    updateTicket("TEST-PID-002", { agent_pid: null });
    updated = getTicket("TEST-PID-002");
    expect(updated?.agent_pid).toBeNull();
  });

  test("should update pr_url field", () => {
    insertTicket({
      id: "TEST-PR-001",
      jira_key: "TEST-PR-001",
      rig: testRig,
    });

    updateTicket("TEST-PR-001", {
      pr_url: "https://github.com/org/repo/pull/123",
    });

    const updated = getTicket("TEST-PR-001");
    expect(updated?.pr_url).toBe("https://github.com/org/repo/pull/123");
  });

  test("should update last_jira_sync field", () => {
    insertTicket({
      id: "TEST-SYNC-001",
      jira_key: "TEST-SYNC-001",
      rig: testRig,
    });

    const syncTime = new Date().toISOString();
    updateTicket("TEST-SYNC-001", {
      last_jira_sync: syncTime,
    });

    const updated = getTicket("TEST-SYNC-001");
    expect(updated?.last_jira_sync).toBe(syncTime);
  });

  test("should update status field", () => {
    insertTicket({
      id: "TEST-STS-001",
      jira_key: "TEST-STS-001",
      rig: testRig,
    });

    updateTicket("TEST-STS-001", {
      status: "implementing",
    });

    const updated = getTicket("TEST-STS-001");
    expect(updated?.status).toBe("implementing");
  });

  test("should update multiple fields at once", () => {
    insertTicket({
      id: "TEST-MULTI-001",
      jira_key: "TEST-MULTI-001",
      rig: testRig,
    });

    updateTicket("TEST-MULTI-001", {
      summary: "Updated summary",
      worktree_path: "/path/to/worktree",
      branch_name: "feat/test",
      status: "blocked",
      agent: "opencode",
      agent_pid: 54321,
    });

    const updated = getTicket("TEST-MULTI-001");
    expect(updated?.summary).toBe("Updated summary");
    expect(updated?.worktree_path).toBe("/path/to/worktree");
    expect(updated?.branch_name).toBe("feat/test");
    expect(updated?.status).toBe("blocked");
    expect(updated?.agent).toBe("opencode");
    expect(updated?.agent_pid).toBe(54321);
  });

  test("should not update when no fields provided", () => {
    insertTicket({
      id: "TEST-NOOP-001",
      jira_key: "TEST-NOOP-001",
      rig: testRig,
      summary: "Original",
    });

    const original = getTicket("TEST-NOOP-001");
    const originalUpdatedAt = original?.updated_at;

    // Call with empty updates
    updateTicket("TEST-NOOP-001", {});

    const afterNoOp = getTicket("TEST-NOOP-001");
    expect(afterNoOp?.summary).toBe("Original");
    expect(afterNoOp?.updated_at).toBe(originalUpdatedAt);
  });

  test("should have updated_at field after update", () => {
    insertTicket({
      id: "TEST-TS-001",
      jira_key: "TEST-TS-001",
      rig: testRig,
    });

    updateTicket("TEST-TS-001", { summary: "Changed" });

    const updated = getTicket("TEST-TS-001");
    // updated_at should be a valid timestamp string
    expect(updated?.updated_at).toBeDefined();
    expect(typeof updated?.updated_at).toBe("string");
  });
});
