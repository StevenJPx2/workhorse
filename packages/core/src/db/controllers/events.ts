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
    const result = await this.db.insert(issueEvents).values(input).returning();
    return result[0]!;
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
}
