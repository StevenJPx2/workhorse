import { eq, asc } from "drizzle-orm";
import { issueEvents } from "../schema";
import type { DrizzleDb } from "../types.ts";
import type { InsertIssueEvent, IssueEvent } from "#db";

/**
 * Controller for IssueEvent operations
 */
export class EventController {
  constructor(private db: DrizzleDb) {}

  /**
   * Insert a new event. Fields with defaults (id, createdAt) are optional.
   */
  insert(input: InsertIssueEvent): IssueEvent {
    return this.db.insert(issueEvents).values(input).returning().get()!;
  }

  /**
   * Get all events for an issue, ordered by created_at ascending
   */
  getForIssue(issueId: string): IssueEvent[] {
    return this.db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.issueId, issueId))
      .orderBy(asc(issueEvents.createdAt))
      .all();
  }
}
