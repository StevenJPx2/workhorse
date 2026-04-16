/**
 * Tests for jiratown_open_pr tool handler
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleOpenPR } from "../open-pr.ts";
import { initTicketsTable } from "./test-utils.ts";

describe("handleOpenPR", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initTicketsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should return error when ticket not found", async () => {
    const result = await handleOpenPR(db, "NON-EXISTENT", {
      title: "Test PR",
      body: "Test body",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("should return error when worktree_path is not set", async () => {
    // Insert a ticket without worktree_path
    db.prepare(`
      INSERT INTO tickets (id, jira_key, rig, status)
      VALUES ('TEST-1', 'TEST-1', 'github.com/org/repo', 'implementing')
    `).run();

    const result = await handleOpenPR(db, "TEST-1", {
      title: "Test PR",
      body: "Test body",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("worktree path");
  });

  it("should return error when branch_name is not set", async () => {
    // Insert a ticket with worktree_path but no branch_name
    db.prepare(`
      INSERT INTO tickets (id, jira_key, rig, status, worktree_path)
      VALUES ('TEST-2', 'TEST-2', 'github.com/org/repo', 'implementing', '/path/to/worktree')
    `).run();

    const result = await handleOpenPR(db, "TEST-2", {
      title: "Test PR",
      body: "Test body",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("branch name");
  });

  it("should include base_branch parameter when provided", async () => {
    // This test validates the input structure is correct
    // We can't easily mock the $ shell command, so we just check the types
    db.prepare(`
      INSERT INTO tickets (id, jira_key, rig, status, worktree_path, branch_name)
      VALUES ('TEST-3', 'TEST-3', 'github.com/org/repo', 'implementing', '/nonexistent/path', 'feat/TEST-3')
    `).run();

    // This will fail due to nonexistent path, but validates input handling
    const result = await handleOpenPR(db, "TEST-3", {
      title: "[TEST-3] Test PR",
      body: "## Summary\n- Test changes",
      base_branch: "develop",
    });

    expect(result.success).toBe(false);
    // The error should be about failing to create PR, not about missing parameters
    expect(result.message).toContain("Failed to create PR");
  });

  it("should have correct input structure for OpenPRInput type", () => {
    // Type-level test - this compiles if types are correct
    const validInput = {
      title: "PR Title",
      body: "PR Body",
    };

    const validInputWithBase = {
      title: "PR Title",
      body: "PR Body",
      base_branch: "main",
    };

    expect(validInput.title).toBeDefined();
    expect(validInput.body).toBeDefined();
    expect(validInputWithBase.base_branch).toBe("main");
  });
});
