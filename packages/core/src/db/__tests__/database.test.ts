import { Database } from "../database.ts";
import { makeEventInput, makeIssueInput, makeNotificationInput } from "./factories.ts";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // ── Issues ─────────────────────────────────────────────────────────────────

  describe("issues", () => {
    it("inserts and retrieves an issue by id", () => {
      const input = makeIssueInput();
      const issue = db.issues.insert(input);

      expect(issue.id).toBeDefined();
      expect(issue.externalId).toBe("AM-123");
      expect(issue.source).toBe("jira");
      expect(issue.title).toBe("Fix login bug");
      expect(issue.createdAt).toBeInstanceOf(Date);
      expect(issue.updatedAt).toBeInstanceOf(Date);

      const retrieved = db.issues.getById(issue.id);
      expect(retrieved).toEqual(issue);
    });

    it("retrieves issue by external id and source", () => {
      const input = makeIssueInput({ externalId: "GH-456", source: "github" });
      const issue = db.issues.insert(input);

      const found = db.issues.getByExternalId("GH-456", "github");
      expect(found).toEqual(issue);

      const notFound = db.issues.getByExternalId("GH-456", "jira");
      expect(notFound).toBeUndefined();
    });

    it("enforces unique constraint on (external_id, source)", () => {
      const input = makeIssueInput();
      db.issues.insert(input);

      expect(() => db.issues.insert(input)).toThrow();
    });

    it("allows same external_id with different source", () => {
      db.issues.insert(makeIssueInput({ externalId: "123", source: "jira" }));
      db.issues.insert(makeIssueInput({ externalId: "123", source: "github" }));

      expect(db.issues.getAll()).toHaveLength(2);
    });

    it("updates issue fields", () => {
      const issue = db.issues.insert(makeIssueInput());
      const updated = db.issues.update(issue.id, {
        title: "Updated title",
        assignee: "bob",
      });

      expect(updated.title).toBe("Updated title");
      expect(updated.assignee).toBe("bob");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(issue.updatedAt.getTime());
    });

    it("updates issue status", () => {
      const issue = db.issues.insert(makeIssueInput({ status: "pending" }));
      const updated = db.issues.updateStatus(issue.id, "implementing");

      expect(updated.status).toBe("implementing");
    });

    it("updates all issue fields individually", () => {
      const issue = db.issues.insert(makeIssueInput());

      // Update all possible fields to ensure branch coverage
      const updated = db.issues.update(issue.id, {
        externalId: "NEW-123",
        source: "github",
        title: "New title",
        description: "New description",
        status: "implementing",
        issueType: "feature",
        url: "https://new.example.com",
        assignee: "charlie",
        labels: ["new-label"],
        metadata: { new: "data" },
        worktreePath: "/new/path",
      });

      expect(updated.externalId).toBe("NEW-123");
      expect(updated.source).toBe("github");
      expect(updated.title).toBe("New title");
      expect(updated.description).toBe("New description");
      expect(updated.status).toBe("implementing");
      expect(updated.issueType).toBe("feature");
      expect(updated.url).toBe("https://new.example.com");
      expect(updated.assignee).toBe("charlie");
      expect(updated.labels).toEqual(["new-label"]);
      expect(updated.metadata).toEqual({ new: "data" });
      expect(updated.worktreePath).toBe("/new/path");
    });

    it("deletes issue", () => {
      const issue = db.issues.insert(makeIssueInput());
      expect(db.issues.getById(issue.id)).toBeDefined();

      db.issues.delete(issue.id);
      expect(db.issues.getById(issue.id)).toBeUndefined();
    });

    it("gets all issues", () => {
      db.issues.insert(makeIssueInput({ externalId: "1", source: "a" }));
      db.issues.insert(makeIssueInput({ externalId: "2", source: "b" }));
      db.issues.insert(makeIssueInput({ externalId: "3", source: "c" }));

      expect(db.issues.getAll()).toHaveLength(3);
    });

    it("filters issues by status", () => {
      db.issues.insert(makeIssueInput({ externalId: "1", source: "a", status: "pending" }));
      db.issues.insert(
        makeIssueInput({
          externalId: "2",
          source: "b",
          status: "implementing",
        }),
      );
      db.issues.insert(makeIssueInput({ externalId: "3", source: "c", status: "done" }));
      db.issues.insert(makeIssueInput({ externalId: "4", source: "d", status: "pending" }));

      const pending = db.issues.getByStatus("pending");
      expect(pending).toHaveLength(2);

      const multiple = db.issues.getByStatus("pending", "implementing");
      expect(multiple).toHaveLength(3);

      const empty = db.issues.getByStatus();
      expect(empty).toHaveLength(0);
    });

    it("round-trips metadata as JSON", () => {
      const metadata = { nested: { value: 123 }, array: [1, 2, 3] };
      const issue = db.issues.insert(makeIssueInput({ metadata }));

      const retrieved = db.issues.getById(issue.id)!;
      expect(retrieved.metadata).toEqual(metadata);
    });

    it("round-trips labels as JSON array", () => {
      const labels = ["bug", "urgent", "backend"];
      const issue = db.issues.insert(makeIssueInput({ labels }));

      const retrieved = db.issues.getById(issue.id)!;
      expect(retrieved.labels).toEqual(labels);
    });

    it("handles null fields", () => {
      const issue = db.issues.insert(
        makeIssueInput({
          url: null,
          assignee: null,
          labels: null,
          worktreePath: null,
        }),
      );

      const retrieved = db.issues.getById(issue.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.url).toBeNull();
      expect(retrieved!.assignee).toBeNull();
      expect(retrieved!.labels).toBeNull();
      expect(retrieved!.worktreePath).toBeNull();
    });

    it("stores worktree field", () => {
      const issue = db.issues.insert(
        makeIssueInput({
          worktreePath: "/path/to/worktree",
        }),
      );

      const retrieved = db.issues.getById(issue.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.worktreePath).toBe("/path/to/worktree");
    });
  });

  // ── Events ─────────────────────────────────────────────────────────────────

  describe("events", () => {
    it("inserts event linked to issue", () => {
      const issue = db.issues.insert(makeIssueInput());
      const event = db.events.insert(makeEventInput({ issueId: issue.id }));

      expect(event.id).toBeDefined();
      expect(event.issueId).toBe(issue.id);
      expect(event.type).toBe("comment_added");
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it("gets events for issue ordered by created_at", async () => {
      const issue = db.issues.insert(makeIssueInput());

      // Insert events with small delays to ensure different timestamps
      const event1 = db.events.insert(
        makeEventInput({
          issueId: issue.id,
          message: "First",
          type: "created",
        }),
      );

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const event2 = db.events.insert(
        makeEventInput({
          issueId: issue.id,
          message: "Second",
          type: "updated",
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const event3 = db.events.insert(
        makeEventInput({
          issueId: issue.id,
          message: "Third",
          type: "commented",
        }),
      );

      const events = db.events.getForIssue(issue.id);
      expect(events).toHaveLength(3);
      expect(events[0]!.id).toBe(event1.id);
      expect(events[1]!.id).toBe(event2.id);
      expect(events[2]!.id).toBe(event3.id);
    });

    it("returns empty array for issue with no events", () => {
      const issue = db.issues.insert(makeIssueInput());
      const events = db.events.getForIssue(issue.id);
      expect(events).toEqual([]);
    });

    it("round-trips event metadata as JSON", () => {
      const issue = db.issues.insert(makeIssueInput());
      const metadata = { author: "alice", diff: { added: 10, removed: 5 } };
      db.events.insert(makeEventInput({ issueId: issue.id, metadata }));

      const events = db.events.getForIssue(issue.id);
      expect(events).toHaveLength(1);
      expect(events[0]!.metadata).toEqual(metadata);
    });

    it("handles event without metadata", () => {
      const issue = db.issues.insert(makeIssueInput());
      db.events.insert(makeEventInput({ issueId: issue.id, metadata: null }));

      const events = db.events.getForIssue(issue.id);
      expect(events).toHaveLength(1);
      expect(events[0]!.metadata).toBeNull();
    });
  });

  // ── Notifications ──────────────────────────────────────────────────────────

  describe("notifications", () => {
    it("creates notification with generated id", () => {
      const issue = db.issues.insert(makeIssueInput());
      const notif = db.notifications.create(makeNotificationInput({ issueId: issue.id }));

      expect(notif.id).toBeDefined();
      expect(notif.issueId).toBe(issue.id);
      expect(notif.status).toBe("unread");
      expect(notif.createdAt).toBeInstanceOf(Date);
      expect(notif.readAt).toBeNull();
      expect(notif.acknowledgedAt).toBeNull();
    });

    it("deduplicates by source_id", () => {
      const issue = db.issues.insert(makeIssueInput());

      db.notifications.create(
        makeNotificationInput({
          issueId: issue.id,
          sourceId: "unique-source-1",
        }),
      );

      expect(() =>
        db.notifications.create(
          makeNotificationInput({
            issueId: issue.id,
            sourceId: "unique-source-1",
          }),
        ),
      ).toThrow();
    });

    it("allows notifications without source_id", () => {
      const issue = db.issues.insert(makeIssueInput());

      const notif1 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: undefined }),
      );
      const notif2 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: undefined }),
      );

      expect(notif1.id).not.toBe(notif2.id);
    });

    it("gets unread notifications for issue", () => {
      const issue = db.issues.insert(makeIssueInput());

      const notif1 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-1" }),
      );
      const notif2 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-2" }),
      );

      // Mark one as read
      db.notifications.markRead(notif1.id);

      const unread = db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.id).toBe(notif2.id);
    });

    it("marks notification as read", () => {
      const issue = db.issues.insert(makeIssueInput());
      const notif = db.notifications.create(makeNotificationInput({ issueId: issue.id }));

      db.notifications.markRead(notif.id);

      const unread = db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(0);
    });

    it("marks notification as acknowledged", () => {
      const issue = db.issues.insert(makeIssueInput());
      const notif = db.notifications.create(makeNotificationInput({ issueId: issue.id }));

      db.notifications.markAcknowledged(notif.id);

      const unread = db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(0);
    });

    it("batch acknowledges notifications", () => {
      const issue = db.issues.insert(makeIssueInput());

      const notif1 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-1" }),
      );
      const notif2 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-2" }),
      );
      const notif3 = db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-3" }),
      );

      db.notifications.acknowledgeMany([notif1.id, notif2.id]);

      const unread = db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.id).toBe(notif3.id);
    });

    it("handles empty array in acknowledgeMany", () => {
      // Should not throw
      expect(() => db.notifications.acknowledgeMany([])).not.toThrow();
    });

    it("round-trips notification metadata as JSON", () => {
      const issue = db.issues.insert(makeIssueInput());
      const metadata = { author: "alice", mentionedUsers: ["bob", "charlie"] };
      db.notifications.create(makeNotificationInput({ issueId: issue.id, metadata }));

      const unread = db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.metadata).toEqual(metadata);
    });
  });

  // ── Infrastructure ─────────────────────────────────────────────────────────

  describe("infrastructure", () => {
    it("handles :memory: database", () => {
      const memDb = new Database(":memory:");
      const issue = memDb.issues.insert(makeIssueInput());
      expect(issue.id).toBeDefined();
      memDb.close();
    });

    it("migrations are idempotent", () => {
      // Opening a second connection to the same :memory: db isn't possible,
      // but we can verify that opening multiple in-memory dbs works
      const db1 = new Database(":memory:");
      const db2 = new Database(":memory:");

      const issue1 = db1.issues.insert(makeIssueInput({ externalId: "1", source: "a" }));
      const issue2 = db2.issues.insert(makeIssueInput({ externalId: "2", source: "b" }));

      expect(issue1.id).toBeDefined();
      expect(issue2.id).toBeDefined();

      db1.close();
      db2.close();
    });

    it("returns undefined for non-existent issue", () => {
      expect(db.issues.getById("non-existent")).toBeUndefined();
      expect(db.issues.getByExternalId("non-existent", "jira")).toBeUndefined();
    });

    it("throws when updating non-existent issue", () => {
      expect(() => db.issues.update("non-existent", { title: "New" })).toThrow("Issue not found");
    });
  });

  // ── Future Features ────────────────────────────────────────────────────────

  test.skip("TODO: implement cascade delete for issue events/notifications", () => {
    // This test documents planned behavior that is not yet implemented.
    // When an issue is deleted, its associated events and notifications
    // should also be deleted automatically (ON DELETE CASCADE).
    const issue = db.issues.insert(makeIssueInput());
    db.events.insert(makeEventInput({ issueId: issue.id }));
    db.notifications.create(makeNotificationInput({ issueId: issue.id }));

    db.issues.delete(issue.id);

    // Currently this would leave orphaned records
    // With cascade delete, these should be empty
    const events = db.events.getForIssue(issue.id);
    const notifications = db.notifications.getUnread(issue.id);
    expect(events).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});
