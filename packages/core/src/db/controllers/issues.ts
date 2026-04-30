import { and, eq, inArray } from "drizzle-orm";
import type { InsertIssue, Issue, IssueStatus } from "#db";
import { issues } from "../schema";
import type { DrizzleDb } from "../types.ts";

/**
 * Controller for Issue CRUD operations
 */
export class IssueController {
  constructor(private db: DrizzleDb) {}

  /**
   * Insert a new issue. Fields with defaults (id, status, timestamps) are optional.
   */
  async insert(input: InsertIssue): Promise<Issue> {
    const result = await this.db.insert(issues).values(input).returning();
    return result[0]!;
  }

  /**
   * Get an issue by its internal ID
   */
  async getById(id: string): Promise<Issue | undefined> {
    const result = await this.db.select().from(issues).where(eq(issues.id, id));
    return result[0];
  }

  /**
   * Get an issue by its external ID and source
   */
  async getByExternalId(externalId: string, source: string): Promise<Issue | undefined> {
    const result = await this.db
      .select()
      .from(issues)
      .where(and(eq(issues.externalId, externalId), eq(issues.source, source)));
    return result[0];
  }

  /**
   * Get all issues
   */
  async getAll(): Promise<Issue[]> {
    return this.db.select().from(issues);
  }

  /**
   * Get issues by status(es)
   */
  async getByStatus(...statuses: IssueStatus[]): Promise<Issue[]> {
    if (statuses.length === 0) return [];

    return this.db.select().from(issues).where(inArray(issues.status, statuses));
  }

  /**
   * Update an issue
   */
  async update(id: string, updates: Partial<Omit<Issue, "id" | "createdAt">>): Promise<Issue> {
    await this.db
      .update(issues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(issues.id, id));

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Issue not found: ${id}`);
    }
    return updated;
  }

  /**
   * Update only the status of an issue
   */
  async updateStatus(id: string, status: IssueStatus): Promise<Issue> {
    return this.update(id, { status });
  }

  /**
   * Delete an issue
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(issues).where(eq(issues.id, id));
  }
}
