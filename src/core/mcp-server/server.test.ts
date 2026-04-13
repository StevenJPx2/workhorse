/**
 * Tests for MCP Server tool registration
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

import { createJiratownServer } from "./server.ts";
import { getToolDefinitions, type ToolDefinition } from "./tool-definitions.ts";
import { TOOL_NAMES } from "./tool-names.ts";
import { initNotificationsTable } from "../notifications/notification-store.ts";

// Test helpers
function initTicketsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planning',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function insertTicket(
  db: Database,
  id: string,
  jiraKey: string,
  status: string = "planning",
): void {
  db.prepare("INSERT INTO tickets (id, jira_key, status) VALUES (?, ?, ?)").run(
    id,
    jiraKey,
    status,
  );
}

describe("TOOL_NAMES", () => {
  test("should export all tool names", () => {
    expect(TOOL_NAMES.GET_NOTIFICATIONS).toBe("jiratown_get_notifications");
    expect(TOOL_NAMES.ACKNOWLEDGE).toBe("jiratown_acknowledge");
    expect(TOOL_NAMES.UPDATE_STATUS).toBe("jiratown_update_status");
    expect(TOOL_NAMES.ESCALATE).toBe("jiratown_escalate");
  });
});

describe("getToolDefinitions", () => {
  test("should return definitions for all tools", () => {
    const defs = getToolDefinitions();

    expect(defs).toHaveLength(4);

    const names = defs.map((d: ToolDefinition) => d.name);
    expect(names).toContain("jiratown_get_notifications");
    expect(names).toContain("jiratown_acknowledge");
    expect(names).toContain("jiratown_update_status");
    expect(names).toContain("jiratown_escalate");
  });

  test("get_notifications should have correct schema", () => {
    const defs = getToolDefinitions();
    const def = defs.find((d: ToolDefinition) => d.name === "jiratown_get_notifications");

    expect(def).toBeDefined();
    expect(def!.description).toContain("notifications");
    expect(def!.inputSchema).toBeDefined();

    // Input is empty object (no params needed)
    const parsed = def!.inputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  test("acknowledge should have correct schema", () => {
    const defs = getToolDefinitions();
    const def = defs.find((d: ToolDefinition) => d.name === "jiratown_acknowledge");

    expect(def).toBeDefined();
    expect(def!.description.toLowerCase()).toContain("acknowledge");
    expect(def!.inputSchema).toBeDefined();

    // Valid input
    const validParsed = def!.inputSchema.safeParse({
      notification_ids: ["id1", "id2"],
    });
    expect(validParsed.success).toBe(true);

    // Invalid input - missing field
    const invalidParsed = def!.inputSchema.safeParse({});
    expect(invalidParsed.success).toBe(false);
  });

  test("update_status should have correct schema", () => {
    const defs = getToolDefinitions();
    const def = defs.find((d: ToolDefinition) => d.name === "jiratown_update_status");

    expect(def).toBeDefined();
    expect(def!.description).toContain("status");
    expect(def!.inputSchema).toBeDefined();

    // Valid input
    const validParsed = def!.inputSchema.safeParse({ status: "implementing" });
    expect(validParsed.success).toBe(true);

    // Valid with message
    const withMessage = def!.inputSchema.safeParse({
      status: "testing",
      message: "Running unit tests",
    });
    expect(withMessage.success).toBe(true);

    // Invalid status
    const invalidStatus = def!.inputSchema.safeParse({ status: "invalid" });
    expect(invalidStatus.success).toBe(false);
  });

  test("escalate should have correct schema", () => {
    const defs = getToolDefinitions();
    const def = defs.find((d: ToolDefinition) => d.name === "jiratown_escalate");

    expect(def).toBeDefined();
    expect(def!.description.toLowerCase()).toContain("escalate");
    expect(def!.inputSchema).toBeDefined();

    // Valid input
    const validParsed = def!.inputSchema.safeParse({
      questions: ["How should this be implemented?"],
      context: "Working on feature X",
      blocking: false,
    });
    expect(validParsed.success).toBe(true);

    // Missing required field
    const missingQuestions = def!.inputSchema.safeParse({
      context: "Working on feature X",
      blocking: false,
    });
    expect(missingQuestions.success).toBe(false);
  });
});

describe("createJiratownServer", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNotificationsTable(db);
    initTicketsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  test("should create server with correct name and version", () => {
    const { server, handlers } = createJiratownServer(db, "TICKET-123");

    expect(server).toBeDefined();
    expect(handlers).toBeDefined();
    expect(typeof handlers.getNotifications).toBe("function");
    expect(typeof handlers.acknowledge).toBe("function");
    expect(typeof handlers.updateStatus).toBe("function");
    expect(typeof handlers.escalate).toBe("function");
  });

  test("getNotifications handler should return notifications", () => {
    insertTicket(db, "TICKET-123", "PROJ-123");

    const { handlers } = createJiratownServer(db, "TICKET-123");
    const result = handlers.getNotifications();

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
  });

  test("acknowledge handler should acknowledge notifications", () => {
    insertTicket(db, "TICKET-123", "PROJ-123");

    const { handlers } = createJiratownServer(db, "TICKET-123");
    const result = handlers.acknowledge({ notification_ids: [] });

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
  });

  test("updateStatus handler should update ticket status", () => {
    insertTicket(db, "TICKET-123", "PROJ-123", "planning");

    const { handlers } = createJiratownServer(db, "TICKET-123");
    const result = handlers.updateStatus({ status: "implementing" });

    expect(result).toHaveProperty("content");

    // Verify status was updated
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("TICKET-123") as {
      status: string;
    };
    expect(ticket.status).toBe("implementing");
  });

  test("escalate handler should create escalation notification", () => {
    insertTicket(db, "TICKET-123", "PROJ-123");

    const { handlers } = createJiratownServer(db, "TICKET-123");
    const result = handlers.escalate({
      questions: ["What API should I use?"],
      context: "Implementing feature X",
      blocking: false,
    });

    expect(result).toHaveProperty("content");

    // Verify notification was created
    const notif = db.prepare("SELECT * FROM notifications WHERE ticket_id = ?").get("TICKET-123");
    expect(notif).toBeDefined();
  });

  test("escalate with blocking=true should block ticket", () => {
    insertTicket(db, "TICKET-123", "PROJ-123", "implementing");

    const { handlers } = createJiratownServer(db, "TICKET-123");
    handlers.escalate({
      questions: ["Critical question"],
      context: "Cannot proceed",
      blocking: true,
    });

    // Verify ticket status is blocked
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("TICKET-123") as {
      status: string;
    };
    expect(ticket.status).toBe("blocked");
  });
});
