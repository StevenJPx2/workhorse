import { eq, and, inArray } from "drizzle-orm";
import { issues } from "../schema";
import type { DrizzleDb } from "../types.ts";
import type { InsertIssue, Issue, IssueStatus } from "#db";

/**
 * Controller for Issue CRUD operations
 */
export class IssueController {
  constructor(private db: DrizzleDb) {}

  /**
   * Insert a new issue. Fields with defaults (id, status, timestamps) are optional.
   */
  insert(input: InsertIssue): Issue {
    return this.db.insert(issues).values(input).returning().get()!;
  }

  /**
   * Get an issue by its internal ID
   */
  getById(id: string): Issue | undefined {
    return this.db.select().from(issues).where(eq(issues.id, id)).get();
  }

  /**
   * Get an issue by its external ID and source
   */
  getByExternalId(externalId: string, source: string): Issue | undefined {
    return this.db
      .select()
      .from(issues)
      .where(and(eq(issues.externalId, externalId), eq(issues.source, source)))
      .get();
  }

  /**
   * Get all issues
   */
  getAll(): Issue[] {
    return this.db.select().from(issues).all();
  }

  /**
   * Get issues by status(es)
   */
  getByStatus(...statuses: IssueStatus[]): Issue[] {
    if (statuses.length === 0) return [];

    return this.db.select().from(issues).where(inArray(issues.status, statuses)).all();
  }

  /**
   * Update an issue
   */
  update(id: string, updates: Partial<Omit<Issue, "id" | "createdAt">>): Issue {
    this.db
      .update(issues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .run();

    const updated = this.getById(id);
    if (!updated) {
      throw new Error(`Issue not found: ${id}`);
    }
    return updated;
  }

  /**
   * Update only the status of an issue
   */
  updateStatus(id: string, status: IssueStatus): Issue {
    return this.update(id, { status });
  }

  /**
   * Delete an issue
   */
  delete(id: string): void {
    this.db.delete(issues).where(eq(issues.id, id)).run();
  }
}
