/**
 * Tests for FileChanges component logic
 */

import { describe, it, expect } from "bun:test";
import type { EventLogEntry } from "../../hooks/use-event-log/types.ts";
import type { TicketEvent } from "#types/ticket.ts";

// FileChangeEntry type (mirrors the component)
interface FileChangeEntry {
  path: string;
  additions: number;
  deletions: number;
  timestamp: string;
}

// Extract from log entries (mirrors component logic)
function extractFromLogEntries(entries: EventLogEntry[]): FileChangeEntry[] {
  return entries
    .filter((e) => e.eventType === "file_modified")
    .map((e) => ({
      path: String(e.payload.path ?? ""),
      additions: Number(e.payload.additions ?? 0),
      deletions: Number(e.payload.deletions ?? 0),
      timestamp: e.timestamp,
    }));
}

// Extract from raw events (mirrors component logic)
function extractFromRawEvents(events: TicketEvent[]): FileChangeEntry[] {
  const result: FileChangeEntry[] = [];
  for (const event of events) {
    if (event.event_type !== "file_modified") continue;
    try {
      const payload = JSON.parse(event.payload);
      result.push({
        path: String(payload.path ?? ""),
        additions: Number(payload.additions ?? 0),
        deletions: Number(payload.deletions ?? 0),
        timestamp: event.timestamp,
      });
    } catch {
      // Skip malformed payloads
    }
  }
  return result;
}

// Format change count (mirrors component logic)
function formatChangeCount(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.length > 0 ? parts.join(" ") : "modified";
}

// Shorten path (mirrors component logic)
function shortPath(path: string, maxLen: number = 40): string {
  if (path.length <= maxLen) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path.slice(-maxLen);
  const first = parts[0];
  const last = parts[parts.length - 1];
  const result = `${first}/.../${last}`;
  return result.length <= maxLen ? result : last.slice(-maxLen);
}

// Aggregate file changes (mirrors component logic)
function aggregateFileChanges(changes: FileChangeEntry[]): FileChangeEntry[] {
  const seen = new Map<string, FileChangeEntry>();
  for (const change of changes) {
    const existing = seen.get(change.path);
    if (existing) {
      existing.additions += change.additions;
      existing.deletions += change.deletions;
    } else {
      seen.set(change.path, { ...change });
    }
  }
  return Array.from(seen.values());
}

describe("file-changes", () => {
  describe("extractFromLogEntries", () => {
    it("should extract file changes from log entries", () => {
      const entries: EventLogEntry[] = [
        {
          id: 1,
          ticketId: "TEST-123",
          eventType: "file_modified",
          payload: { path: "/path/to/file.ts", additions: 10, deletions: 2 },
          timestamp: "2024-01-01T00:00:00Z",
        },
        {
          id: 2,
          ticketId: "TEST-123",
          eventType: "status_change",
          payload: { from: "open", to: "in_progress" },
          timestamp: "2024-01-01T00:00:01Z",
        },
      ];

      const result = extractFromLogEntries(entries);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("/path/to/file.ts");
      expect(result[0].additions).toBe(10);
      expect(result[0].deletions).toBe(2);
    });

    it("should return empty array for no file_modified events", () => {
      const entries: EventLogEntry[] = [
        {
          id: 1,
          ticketId: "TEST-123",
          eventType: "status_change",
          payload: {},
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromLogEntries(entries);
      expect(result).toEqual([]);
    });

    it("should handle empty path", () => {
      const entries: EventLogEntry[] = [
        {
          id: 1,
          ticketId: "TEST-123",
          eventType: "file_modified",
          payload: { path: "", additions: 5, deletions: 0 },
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromLogEntries(entries);
      expect(result[0].path).toBe("");
    });

    it("should handle undefined payload fields", () => {
      const entries: EventLogEntry[] = [
        {
          id: 1,
          ticketId: "TEST-123",
          eventType: "file_modified",
          payload: { path: "/file.ts" },
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromLogEntries(entries);
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(0);
    });
  });

  describe("extractFromRawEvents", () => {
    it("should extract file changes from raw events", () => {
      const events: TicketEvent[] = [
        {
          id: 1,
          ticket_id: "TEST-123",
          event_type: "file_modified",
          payload: JSON.stringify({ path: "/path/to/file.ts", additions: 5, deletions: 1 }),
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromRawEvents(events);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("/path/to/file.ts");
      expect(result[0].additions).toBe(5);
      expect(result[0].deletions).toBe(1);
    });

    it("should skip non-file_modified events", () => {
      const events: TicketEvent[] = [
        {
          id: 1,
          ticket_id: "TEST-123",
          event_type: "status_change",
          payload: JSON.stringify({}),
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromRawEvents(events);
      expect(result).toEqual([]);
    });

    it("should handle malformed JSON", () => {
      const events: TicketEvent[] = [
        {
          id: 1,
          ticket_id: "TEST-123",
          event_type: "file_modified",
          payload: "invalid json",
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromRawEvents(events);
      expect(result).toEqual([]);
    });

    it("should handle missing payload fields", () => {
      const events: TicketEvent[] = [
        {
          id: 1,
          ticket_id: "TEST-123",
          event_type: "file_modified",
          payload: JSON.stringify({ path: "/file.ts" }),
          timestamp: "2024-01-01T00:00:00Z",
        },
      ];

      const result = extractFromRawEvents(events);
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(0);
    });
  });

  describe("formatChangeCount", () => {
    it("should format additions and deletions", () => {
      expect(formatChangeCount(10, 2)).toBe("+10 -2");
    });

    it("should format only additions", () => {
      expect(formatChangeCount(5, 0)).toBe("+5");
    });

    it("should format only deletions", () => {
      expect(formatChangeCount(0, 3)).toBe("-3");
    });

    it("should return modified for no changes", () => {
      expect(formatChangeCount(0, 0)).toBe("modified");
    });
  });

  describe("shortPath", () => {
    it("should return short path as-is", () => {
      const path = "src/file.ts";
      expect(shortPath(path, 40)).toBe(path);
    });

    it("should shorten long path with ellipsis", () => {
      const path = "very/long/path/to/the/file/that/is/deeply/nested.ts";
      const result = shortPath(path, 40);
      expect(result).toContain("...");
      expect(result.length).toBeLessThanOrEqual(40);
    });

    it("should handle path with few parts", () => {
      const path = "src/components/very-long-filename-that-exceeds-limit.tsx";
      const result = shortPath(path, 30);
      // For 2-part paths, it should slice from the end
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it("should handle single part path", () => {
      const path = "filename.ts";
      expect(shortPath(path, 40)).toBe(path);
    });
  });

  describe("aggregateFileChanges", () => {
    it("should aggregate changes to same file", () => {
      const changes: FileChangeEntry[] = [
        { path: "/file.ts", additions: 10, deletions: 2, timestamp: "2024-01-01T00:00:00Z" },
        { path: "/file.ts", additions: 5, deletions: 1, timestamp: "2024-01-01T00:00:01Z" },
        { path: "/other.ts", additions: 3, deletions: 0, timestamp: "2024-01-01T00:00:02Z" },
      ];

      const result = aggregateFileChanges(changes);
      expect(result).toHaveLength(2);

      const fileTs = result.find((c) => c.path === "/file.ts");
      expect(fileTs?.additions).toBe(15);
      expect(fileTs?.deletions).toBe(3);
    });

    it("should handle single change", () => {
      const changes: FileChangeEntry[] = [
        { path: "/file.ts", additions: 10, deletions: 2, timestamp: "2024-01-01T00:00:00Z" },
      ];

      const result = aggregateFileChanges(changes);
      expect(result).toHaveLength(1);
      expect(result[0].additions).toBe(10);
    });

    it("should handle empty array", () => {
      const result = aggregateFileChanges([]);
      expect(result).toEqual([]);
    });
  });
});
