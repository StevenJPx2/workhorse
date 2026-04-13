import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase, resetDatabaseRef, insertTicket } from "../../lib/db/index.ts";
import { useEventLog } from "./use-event-log.ts";

describe("useEventLog", () => {
  function nextId(): string {
    return `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  beforeEach(() => {
    closeDatabase();
    resetDatabaseRef();
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    resetDatabaseRef();
  });

  it("logs a status change event", () => {
    const id = nextId();
    insertTicket({
      id,
      jira_key: id,
      rig: "github.com/test/repo",
      summary: "Test ticket",
    });

    const log = useEventLog({ ticketId: id });
    const entry = log.logStatusChange({ from: "pending", to: "implementing" });
    expect(entry.eventType).toBe("status_change");
    expect(entry.payload.from).toBe("pending");
    expect(entry.payload.to).toBe("implementing");
    expect(entry.ticketId).toBe(id);
  });

  it("logs a file modified event", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    const entry = log.logFileModified({
      path: "src/app.ts",
      additions: 10,
      deletions: 5,
    });
    expect(entry.eventType).toBe("file_modified");
    expect(entry.payload.path).toBe("src/app.ts");
  });

  it("logs a test result event", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    const entry = log.logTestResult({ passed: 8, failed: 2, total: 10 });
    expect(entry.eventType).toBe("test_result");
    expect(entry.payload.passed).toBe(8);
    expect(entry.payload.total).toBe(10);
  });

  it("logs a comment event", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    const entry = log.logComment({
      source: "agent",
      content: "Started working on the issue",
    });
    expect(entry.eventType).toBe("comment");
    expect(entry.payload.source).toBe("agent");
  });

  it("logs an escalation event", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    const entry = log.logEscalation(["Question 1?", "Question 2?"]);
    expect(entry.eventType).toBe("escalation");
    expect((entry.payload.questions as string[]).length).toBe(2);
  });

  it("logs custom events", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    const entry = log.logCustom("notification", { key: "value" });
    expect(entry.eventType).toBe("notification");
    expect(entry.payload.key).toBe("value");
  });

  it("filters events by type", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    log.logStatusChange({ from: "pending", to: "implementing" });
    log.logComment({ source: "user", content: "hello" });
    log.logStatusChange({ from: "implementing", to: "done" });
    const statusChanges = log.getEventsByType("status_change");
    expect(statusChanges.length).toBe(2);
  });

  it("returns recent events", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    log.logStatusChange({ from: "pending", to: "queued" });
    log.logStatusChange({ from: "queued", to: "implementing" });
    log.logStatusChange({ from: "implementing", to: "done" });
    const recent = log.getRecentEvents(2);
    expect(recent.length).toBe(2);
    expect(recent[0].payload.to).toBe("done");
  });

  it("throws when no ticket ID set", () => {
    const log = useEventLog();
    expect(() => log.logStatusChange({ from: "pending", to: "implementing" })).toThrow(
      "No ticket ID set for event log",
    );
  });

  it("counts events correctly", () => {
    const id = nextId();
    insertTicket({ id, jira_key: id, rig: "github.com/test/repo", summary: "T" });
    const log = useEventLog({ ticketId: id });
    expect(log.count()).toBe(0);
    log.logStatusChange({ from: "pending", to: "implementing" });
    expect(log.count()).toBe(1);
    log.logComment({ source: "agent", content: "test" });
    expect(log.count()).toBe(2);
  });
});
