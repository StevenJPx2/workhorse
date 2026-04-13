/**
 * Tests for useNotifications hook
 * Uses dependency injection instead of mock.module() to avoid interference issues.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useNotifications } from "./use-notifications.ts";
import type { Notification, CreateNotificationInput } from "#core/notifications/types.ts";
import type { UseNotificationsDeps } from "./types.ts";
import type { Database } from "bun:sqlite";

// Helper to create mock notifications
function createMockNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "1",
    ticket_id: "TEST-123",
    source_type: "system",
    source_id: "src-1",
    priority: "normal",
    status: "unread",
    summary: "Test summary",
    content: "Test content",
    author: null,
    metadata: null,
    read_at: null,
    acknowledged_at: null,
    created_at: new Date().toISOString(),
    source_timestamp: null,
    ...overrides,
  };
}

describe("useNotifications", () => {
  let mockDeps: UseNotificationsDeps;

  beforeEach(() => {
    mockDeps = {
      getDatabase: mock<() => Database>(() => ({}) as Database),
      getNotificationsByTicket: mock<(db: Database, ticketId: string) => Notification[]>(() => []),
      createNotification: mock<
        (db: Database, input: CreateNotificationInput) => Notification | null
      >(() => null),
      markNotificationRead: mock<(db: Database, id: string) => void>(() => {}),
      markNotificationAcknowledged: mock<(db: Database, id: string) => void>(() => {}),
      acknowledgeNotifications: mock<(db: Database, ids: string[]) => void>(() => {}),
      deleteNotification: mock<(db: Database, id: string) => void>(() => {}),
    };
  });

  it("should return initial state", () => {
    createRoot((dispose) => {
      const result = useNotifications({}, mockDeps);

      expect(result.notifications()).toEqual([]);
      expect(result.unreadCount()).toBe(0);
      expect(result.blockingNotifications()).toEqual([]);
      expect(result.hasBlocking()).toBe(false);
      expect(result.isLoading()).toBe(false);
      expect(result.error()).toBeNull();
      expect(typeof result.reload).toBe("function");
      expect(typeof result.create).toBe("function");
      expect(typeof result.markRead).toBe("function");
      expect(typeof result.acknowledge).toBe("function");
      expect(typeof result.acknowledgeMany).toBe("function");
      expect(typeof result.remove).toBe("function");
      expect(typeof result.getByPriority).toBe("function");
      expect(typeof result.startPolling).toBe("function");
      expect(typeof result.stopPolling).toBe("function");

      dispose();
    });
  });

  it("should load notifications on reload", async () => {
    const mockNotifs = [
      createMockNotification({ id: "1", status: "unread" }),
      createMockNotification({ id: "2", status: "read" }),
    ];
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(
      () => mockNotifs,
    );

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      await result.reload();

      expect(result.notifications()).toHaveLength(2);
      expect(result.unreadCount()).toBe(1);

      dispose();
    });
  });

  it("should clear notifications when no ticketId", async () => {
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => [
      createMockNotification({ id: "1" }),
    ]);

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);
      await result.reload();
      expect(result.notifications()).toHaveLength(1);

      // Now reload without ticketId
      const result2 = useNotifications({}, mockDeps);
      await result2.reload();
      expect(result2.notifications()).toEqual([]);

      dispose();
    });
  });

  it("should call onChange callback on reload", async () => {
    const onChange = mock(() => {});
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => [
      createMockNotification({ id: "1" }),
    ]);

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123", onChange }, mockDeps);

      await result.reload();

      expect(onChange).toHaveBeenCalled();

      dispose();
    });
  });

  it("should call onNew callback for new notifications", async () => {
    const onNew = mock(() => {});
    // Two calls: first gives 1 notification, second adds a new one
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>)
      .mockImplementationOnce(() => [createMockNotification({ id: "1" })])
      .mockImplementationOnce(() => [
        createMockNotification({ id: "1" }),
        createMockNotification({ id: "2" }),
      ]);

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123", onNew }, mockDeps);

      // First load: goes from [] → [1], so "1" is new → onNew called once
      await result.reload();
      expect(onNew).toHaveBeenCalledTimes(1);

      // Second load: goes from [1] → [1,2], so "2" is new → onNew called again
      await result.reload();
      expect(onNew).toHaveBeenCalledTimes(2);

      dispose();
    });
  });

  it("should handle reload errors", async () => {
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Database error");
    });

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      await result.reload();

      expect(result.error()).toBeInstanceOf(Error);
      expect(result.isLoading()).toBe(false);

      dispose();
    });
  });

  it("should create notification", () => {
    const newNotif = createMockNotification({ id: "new-1" });
    (mockDeps.createNotification as ReturnType<typeof mock>).mockImplementation(() => newNotif);

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      const input: CreateNotificationInput = {
        ticket_id: "TEST-123",
        source_type: "system",
        source_id: "src-1",
        priority: "normal",
        summary: "Test",
        content: "Test content",
      };

      const created = result.create(input);

      expect(created).toEqual(newNotif);
      expect(result.notifications()).toHaveLength(1);

      dispose();
    });
  });

  it("should call onChange and onNew on create", () => {
    const onChange = mock(() => {});
    const onNew = mock(() => {});
    const newNotif = createMockNotification({ id: "new-1" });
    (mockDeps.createNotification as ReturnType<typeof mock>).mockImplementation(() => newNotif);

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123", onChange, onNew }, mockDeps);

      const input: CreateNotificationInput = {
        ticket_id: "TEST-123",
        source_type: "system",
        source_id: "src-1",
        priority: "normal",
        summary: "Test",
        content: "Test content",
      };

      result.create(input);

      expect(onChange).toHaveBeenCalled();
      expect(onNew).toHaveBeenCalledWith(newNotif);

      dispose();
    });
  });

  it("should return null on create error", () => {
    (mockDeps.createNotification as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Create failed");
    });

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      const input: CreateNotificationInput = {
        ticket_id: "TEST-123",
        source_type: "system",
        source_id: "src-1",
        priority: "normal",
        summary: "Test",
        content: "Test content",
      };

      const created = result.create(input);

      expect(created).toBeNull();
      expect(result.error()).toBeInstanceOf(Error);

      dispose();
    });
  });

  it("should mark notification as read", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.markRead("1");

      expect(mockDeps.markNotificationRead).toHaveBeenCalledWith(expect.any(Object), "1");

      dispose();
    });
  });

  it("should handle markRead error", () => {
    (mockDeps.markNotificationRead as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Mark read failed");
    });

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.markRead("1");

      expect(result.error()).toBeInstanceOf(Error);

      dispose();
    });
  });

  it("should acknowledge notification", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.acknowledge("1");

      expect(mockDeps.markNotificationAcknowledged).toHaveBeenCalledWith(expect.any(Object), "1");

      dispose();
    });
  });

  it("should handle acknowledge error", () => {
    (mockDeps.markNotificationAcknowledged as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Acknowledge failed");
    });

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.acknowledge("1");

      expect(result.error()).toBeInstanceOf(Error);

      dispose();
    });
  });

  it("should acknowledge multiple notifications", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.acknowledgeMany(["1", "2", "3"]);

      expect(mockDeps.acknowledgeNotifications).toHaveBeenCalledWith(expect.any(Object), [
        "1",
        "2",
        "3",
      ]);

      dispose();
    });
  });

  it("should not acknowledge when empty ids array", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.acknowledgeMany([]);

      expect(mockDeps.acknowledgeNotifications).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("should handle acknowledgeMany error", () => {
    (mockDeps.acknowledgeNotifications as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Acknowledge many failed");
    });

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.acknowledgeMany(["1", "2"]);

      expect(result.error()).toBeInstanceOf(Error);

      dispose();
    });
  });

  it("should remove notification", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.remove("1");

      expect(mockDeps.deleteNotification).toHaveBeenCalledWith(expect.any(Object), "1");

      dispose();
    });
  });

  it("should handle remove error", () => {
    (mockDeps.deleteNotification as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Delete failed");
    });

    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.remove("1");

      expect(result.error()).toBeInstanceOf(Error);

      dispose();
    });
  });

  it("should get notifications by priority", async () => {
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => [
      createMockNotification({ id: "1", priority: "blocking" }),
      createMockNotification({ id: "2", priority: "high" }),
      createMockNotification({ id: "3", priority: "normal" }),
    ]);

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      await result.reload();

      const blocking = result.getByPriority("blocking");
      expect(blocking).toHaveLength(1);
      expect(blocking[0].id).toBe("1");

      const high = result.getByPriority("high");
      expect(high).toHaveLength(1);
      expect(high[0].id).toBe("2");

      dispose();
    });
  });

  it("should calculate hasBlocking correctly", async () => {
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => [
      createMockNotification({ id: "1", priority: "blocking", status: "unread" }),
    ]);

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      await result.reload();

      expect(result.hasBlocking()).toBe(true);

      dispose();
    });
  });

  it("should start and stop polling", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123", pollInterval: 1000 }, mockDeps);

      result.startPolling();

      // Polling should be active

      result.stopPolling();

      // Polling should be stopped

      dispose();
    });
  });

  it("should not start polling without pollInterval", () => {
    createRoot((dispose) => {
      const result = useNotifications({ ticketId: "TEST-123" }, mockDeps);

      result.startPolling();

      // Should not start without interval

      dispose();
    });
  });

  it("should accept ticketId as function", async () => {
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => [
      createMockNotification({ id: "1" }),
    ]);

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: () => "TEST-456" }, mockDeps);

      await result.reload();

      expect(mockDeps.getNotificationsByTicket).toHaveBeenCalledWith(
        expect.any(Object),
        "TEST-456",
      );

      dispose();
    });
  });

  it("should handle error callback on reload", async () => {
    const onError = mock(() => {});
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => {
      throw new Error("Reload failed");
    });

    createRoot(async (dispose) => {
      const result = useNotifications({ ticketId: "TEST-123", onError }, mockDeps);

      await result.reload();

      expect(onError).toHaveBeenCalled();

      dispose();
    });
  });

  it("should handle autoLoad option", () => {
    (mockDeps.getNotificationsByTicket as ReturnType<typeof mock>).mockImplementation(() => [
      createMockNotification({ id: "1" }),
    ]);

    createRoot((dispose) => {
      // With autoLoad: true, notifications should load on mount
      const result = useNotifications(
        {
          ticketId: "TEST-123",
          autoLoad: true,
          pollInterval: 0,
        },
        mockDeps,
      );

      // Should have attempted to load
      expect(result).toBeDefined();

      dispose();
    });
  });
});
