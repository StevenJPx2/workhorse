import { asc, eq } from "drizzle-orm";
import type { InsertIssueEvent, IssueEvent } from "#db";
import { issueEvents } from "../schema";
import type { DrizzleDb } from "../types.ts";

/**
 * Controller for IssueEvent operations
 */
export class EventController {
  constructor(private db: DrizzleDb) {}

  /**
   * Insert a new event. Fields with defaults (id, createdAt) are optional.
   */
  async insert(input: InsertIssueEvent): Promise<IssueEvent> {
    return await this.db
      .insert(issueEvents)
      .values(input)
      .returning()
      .then((r) => r[0]!);
  }

  /**
   * Get all events for an issue, ordered by created_at ascending
   */
  async getForIssue(issueId: string): Promise<IssueEvent[]> {
    return this.db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.issueId, issueId))
      .orderBy(asc(issueEvents.createdAt));
  }

  /**
   * Delete all events for an issue.
   * Used when deleting an issue to clean up related data.
   */
  async deleteByIssueId(issueId: string): Promise<void> {
    await this.db.delete(issueEvents).where(eq(issueEvents.issueId, issueId));
  }
}
