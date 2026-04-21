import { eq, asc } from "drizzle-orm";
import { issueEvents } from "../schema/index.ts";
import type { DrizzleDb } from "../types.ts";
import type { IssueEvent } from "#types";

/**
 * Controller for IssueEvent operations
 */
export class EventController {
  constructor(private db: DrizzleDb) {}

  /**
   * Insert a new event
   */
  insert(input: Omit<IssueEvent, "id" | "createdAt">): IssueEvent {
    const id = crypto.randomUUID();

    this.db
      .insert(issueEvents)
      .values({ ...input, id, createdAt: new Date() })
      .run();

    return this.getById(id)!;
  }

  /**
   * Get an event by ID (internal use)
   */
  private getById(id: string): IssueEvent | undefined {
    return this.db.select().from(issueEvents).where(eq(issueEvents.id, id)).get();
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
