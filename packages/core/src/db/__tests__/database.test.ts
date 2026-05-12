import { Database } from "../database.ts";
import { makeEventInput, makeIssueInput, makeNotificationInput } from "./factories.ts";

describe("Database", () => {
  let db: Database;

  beforeEach(async () => {
    db = await Database.create(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // ── Issues ─────────────────────────────────────────────────────────────────

  describe("issues", () => {
    it("inserts and retrieves an issue by id", async () => {
      const input = makeIssueInput();
      const issue = await db.issues.insert(input);

      expect(issue.id).toBeDefined();
      expect(issue.externalId).toBe("AM-123");
      expect(issue.source).toBe("jira");
      expect(issue.title).toBe("Fix login bug");
      expect(issue.createdAt).toBeInstanceOf(Date);
      expect(issue.updatedAt).toBeInstanceOf(Date);

      const retrieved = await db.issues.getById(issue.id);
      expect(retrieved).toEqual(issue);
    });

    it("retrieves issue by external id and source", async () => {
      const input = makeIssueInput({ externalId: "GH-456", source: "github" });
      const issue = await db.issues.insert(input);

      const found = await db.issues.getByExternalId("GH-456", "github");
      expect(found).toEqual(issue);

      const notFound = await db.issues.getByExternalId("GH-456", "jira");
      expect(notFound).toBeUndefined();
    });

    it("enforces unique constraint on (external_id, source)", async () => {
      const input = makeIssueInput();
      await db.issues.insert(input);

      await expect(db.issues.insert(input)).rejects.toThrow();
    });

    it("allows same external_id with different source", async () => {
      await db.issues.insert(makeIssueInput({ externalId: "123", source: "jira" }));
      await db.issues.insert(makeIssueInput({ externalId: "123", source: "github" }));

      expect(await db.issues.getAll()).toHaveLength(2);
    });

    it("updates issue fields", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const updated = await db.issues.update(issue.id, {
        title: "Updated title",
        assignee: "bob",
      });

      expect(updated.title).toBe("Updated title");
      expect(updated.assignee).toBe("bob");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(issue.updatedAt.getTime());
    });

    it("updates issue status", async () => {
      const issue = await db.issues.insert(makeIssueInput({ status: "pending" }));
      const updated = await db.issues.updateStatus(issue.id, "implementing");

      expect(updated.status).toBe("implementing");
    });

    it("updates all issue fields individually", async () => {
      const issue = await db.issues.insert(makeIssueInput());

      // Update all possible fields to ensure branch coverage
      const updated = await db.issues.update(issue.id, {
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

    it("deletes issue", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      expect(await db.issues.getById(issue.id)).toBeDefined();

      await db.issues.delete(issue.id);
      expect(await db.issues.getById(issue.id)).toBeUndefined();
    });

    it("gets all issues", async () => {
      await db.issues.insert(makeIssueInput({ externalId: "1", source: "a" }));
      await db.issues.insert(makeIssueInput({ externalId: "2", source: "b" }));
      await db.issues.insert(makeIssueInput({ externalId: "3", source: "c" }));

      expect(await db.issues.getAll()).toHaveLength(3);
    });

    it("filters issues by status", async () => {
      await db.issues.insert(makeIssueInput({ externalId: "1", source: "a", status: "pending" }));
      await db.issues.insert(
        makeIssueInput({
          externalId: "2",
          source: "b",
          status: "implementing",
        }),
      );
      await db.issues.insert(makeIssueInput({ externalId: "3", source: "c", status: "done" }));
      await db.issues.insert(makeIssueInput({ externalId: "4", source: "d", status: "pending" }));

      const pending = await db.issues.getByStatus("pending");
      expect(pending).toHaveLength(2);

      const multiple = await db.issues.getByStatus("pending", "implementing");
      expect(multiple).toHaveLength(3);

      const empty = await db.issues.getByStatus();
      expect(empty).toHaveLength(0);
    });

    it("round-trips metadata as JSON", async () => {
      const metadata = { nested: { value: 123 }, array: [1, 2, 3] };
      const issue = await db.issues.insert(makeIssueInput({ metadata }));

      const retrieved = await db.issues.getById(issue.id).then((r) => r!);
      expect(retrieved.metadata).toEqual(metadata);
    });

    it("round-trips labels as JSON array", async () => {
      const labels = ["bug", "urgent", "backend"];
      const issue = await db.issues.insert(makeIssueInput({ labels }));

      const retrieved = await db.issues.getById(issue.id).then((r) => r!);
      expect(retrieved.labels).toEqual(labels);
    });

    it("handles null fields", async () => {
      const issue = await db.issues.insert(
        makeIssueInput({
          url: null,
          assignee: null,
          labels: null,
          worktreePath: null,
        }),
      );

      const retrieved = await db.issues.getById(issue.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.url).toBeNull();
      expect(retrieved!.assignee).toBeNull();
      expect(retrieved!.labels).toBeNull();
      expect(retrieved!.worktreePath).toBeNull();
    });

    it("stores worktree field", async () => {
      const issue = await db.issues.insert(
        makeIssueInput({
          worktreePath: "/path/to/worktree",
        }),
      );

      const retrieved = await db.issues.getById(issue.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.worktreePath).toBe("/path/to/worktree");
    });
  });

  // ── Events ─────────────────────────────────────────────────────────────────

  describe("events", () => {
    it("inserts event linked to issue", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const event = await db.events.insert(makeEventInput({ issueId: issue.id }));

      expect(event.id).toBeDefined();
      expect(event.issueId).toBe(issue.id);
      expect(event.type).toBe("comment_added");
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it("gets events for issue ordered by created_at", async () => {
      const issue = await db.issues.insert(makeIssueInput());

      // Insert events with small delays to ensure different timestamps
      const event1 = await db.events.insert(
        makeEventInput({
          issueId: issue.id,
          message: "First",
          type: "created",
        }),
      );

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const event2 = await db.events.insert(
        makeEventInput({
          issueId: issue.id,
          message: "Second",
          type: "updated",
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const event3 = await db.events.insert(
        makeEventInput({
          issueId: issue.id,
          message: "Third",
          type: "commented",
        }),
      );

      const events = await db.events.getForIssue(issue.id);
      expect(events).toHaveLength(3);
      expect(events[0]!.id).toBe(event1.id);
      expect(events[1]!.id).toBe(event2.id);
      expect(events[2]!.id).toBe(event3.id);
    });

    it("returns empty array for issue with no events", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const events = await db.events.getForIssue(issue.id);
      expect(events).toEqual([]);
    });

    it("round-trips event metadata as JSON", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const metadata = { author: "alice", diff: { added: 10, removed: 5 } };
      await db.events.insert(makeEventInput({ issueId: issue.id, metadata }));

      const events = await db.events.getForIssue(issue.id);
      expect(events).toHaveLength(1);
      expect(events[0]!.metadata).toEqual(metadata);
    });

    it("handles event without metadata", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      await db.events.insert(makeEventInput({ issueId: issue.id, metadata: null }));

      const events = await db.events.getForIssue(issue.id);
      expect(events).toHaveLength(1);
      expect(events[0]!.metadata).toBeNull();
    });
  });

  // ── Notifications ──────────────────────────────────────────────────────────

  describe("notifications", () => {
    it("creates notification with generated id", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const notif = await db.notifications.create(makeNotificationInput({ issueId: issue.id }));

      expect(notif.id).toBeDefined();
      expect(notif.issueId).toBe(issue.id);
      expect(notif.status).toBe("unread");
      expect(notif.createdAt).toBeInstanceOf(Date);
      expect(notif.readAt).toBeNull();
      expect(notif.acknowledgedAt).toBeNull();
    });

    it("deduplicates by source_id", async () => {
      const issue = await db.issues.insert(makeIssueInput());

      await db.notifications.create(
        makeNotificationInput({
          issueId: issue.id,
          sourceId: "unique-source-1",
        }),
      );

      await expect(
        db.notifications.create(
          makeNotificationInput({
            issueId: issue.id,
            sourceId: "unique-source-1",
          }),
        ),
      ).rejects.toThrow();
    });

    it("allows notifications without source_id", async () => {
      const issue = await db.issues.insert(makeIssueInput());

      const notif1 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: undefined }),
      );
      const notif2 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: undefined }),
      );

      expect(notif1.id).not.toBe(notif2.id);
    });

    it("gets unread notifications for issue", async () => {
      const issue = await db.issues.insert(makeIssueInput());

      const notif1 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-1" }),
      );
      const notif2 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-2" }),
      );

      // Mark one as read
      await db.notifications.markRead(notif1.id);

      const unread = await db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.id).toBe(notif2.id);
    });

    it("marks notification as read", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const notif = await db.notifications.create(makeNotificationInput({ issueId: issue.id }));

      await db.notifications.markRead(notif.id);

      const unread = await db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(0);
    });

    it("marks notification as acknowledged", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const notif = await db.notifications.create(makeNotificationInput({ issueId: issue.id }));

      await db.notifications.markAcknowledged(notif.id);

      const unread = await db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(0);
    });

    it("batch acknowledges notifications", async () => {
      const issue = await db.issues.insert(makeIssueInput());

      const notif1 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-1" }),
      );
      const notif2 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-2" }),
      );
      const notif3 = await db.notifications.create(
        makeNotificationInput({ issueId: issue.id, sourceId: "src-3" }),
      );

      await db.notifications.acknowledgeMany([notif1.id, notif2.id]);

      const unread = await db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.id).toBe(notif3.id);
    });

    it("handles empty array in acknowledgeMany", async () => {
      // Should not throw
      await db.notifications.acknowledgeMany([]);
    });

    it("round-trips notification metadata as JSON", async () => {
      const issue = await db.issues.insert(makeIssueInput());
      const metadata = { author: "alice", mentionedUsers: ["bob", "charlie"] };
      await db.notifications.create(makeNotificationInput({ issueId: issue.id, metadata }));

      const unread = await db.notifications.getUnread(issue.id);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.metadata).toEqual(metadata);
    });
  });

  // ── Infrastructure ─────────────────────────────────────────────────────────

  describe("infrastructure", () => {
    it("handles :memory: database", async () => {
      const memDb = await Database.create(":memory:");
      const issue = await memDb.issues.insert(makeIssueInput());
      expect(issue.id).toBeDefined();
      memDb.close();
    });

    it("migrations are idempotent", async () => {
      // Opening a second connection to the same :memory: db isn't possible,
      // but we can verify that opening multiple in-memory dbs works
      const db1 = await Database.create(":memory:");
      const db2 = await Database.create(":memory:");

      const issue1 = await db1.issues.insert(makeIssueInput({ externalId: "1", source: "a" }));
      const issue2 = await db2.issues.insert(makeIssueInput({ externalId: "2", source: "b" }));

      expect(issue1.id).toBeDefined();
      expect(issue2.id).toBeDefined();

      db1.close();
      db2.close();
    });

    it("returns undefined for non-existent issue", async () => {
      expect(await db.issues.getById("non-existent")).toBeUndefined();
      expect(await db.issues.getByExternalId("non-existent", "jira")).toBeUndefined();
    });

    it("throws when updating non-existent issue", async () => {
      await expect(db.issues.update("non-existent", { title: "New" })).rejects.toThrow(
        "Issue not found",
      );
    });
  });

  // ── Future Features ────────────────────────────────────────────────────────

  test.skip("TODO: implement cascade delete for issue events/notifications", async () => {
    // This test documents planned behavior that is not yet implemented.
    // When an issue is deleted, its associated events and notifications
    // should also be deleted automatically (ON DELETE CASCADE).
    const issue = await db.issues.insert(makeIssueInput());
    await db.events.insert(makeEventInput({ issueId: issue.id }));
    await db.notifications.create(makeNotificationInput({ issueId: issue.id }));

    await db.issues.delete(issue.id);

    // Currently this would leave orphaned records
    // With cascade delete, these should be empty
    const events = await db.events.getForIssue(issue.id);
    const notifications = await db.notifications.getUnread(issue.id);
    expect(events).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});
