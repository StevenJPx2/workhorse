import type { Emitter } from "mitt";
import type { Database } from "#db";
import type { HookEventMap } from "#lib/hooks";
import { L1Store } from "./l1/store.ts";
import { L2Store } from "./l2.ts";
import { NotificationService } from "./notifications.ts";

/**
 * MemoryService - Two-tier memory system for Jiratown agents.
 *
 * Facade providing access to:
 * - `l1`: Session memory (context.md per worktree) - fast, append-only, markdown-based
 * - `l2`: Semantic search (retriv with FTS5 + vector embeddings) - long-term knowledge
 * - `notifications`: Notification management with hook integration
 *
 * @example
 * ```typescript
 * const memory = await MemoryService.create({
 *   db,
 *   hooks,
 *   worktreesRoot: "/path/to/worktrees",
 *   memoryDbPath: "/path/to/memory.db",
 * });
 *
 * // L1: Session memory by issue ID
 * const ctx = memory.l1.get("AM-123");
 * if (ctx) {
 *   const session = await ctx.read();
 * }
 *
 * // Register new worktree and create context
 * const newCtx = memory.l1.register("AM-456", "/path/to/worktree");
 * await newCtx.create("AM-456: New feature", "planning");
 *
 * // L2: Semantic search
 * await memory.l2.index([{ id: "doc-1", content: "...", metadata: { type: "decision" } }]);
 * const results = await memory.l2.search("authentication flow", { limit: 5 });
 *
 * // Notifications
 * memory.notifications.create({ issueId: "AM-123", source: "jira", title: "New comment", body: "..." });
 * const unread = memory.notifications.getUnread("AM-123");
 *
 * await memory.shutdown();
 * ```
 */
export class MemoryService {
  private constructor(
    /** L1: Session memory (context.md per worktree) */
    readonly l1: L1Store,
    /** L2: Semantic search (retriv) */
    readonly l2: L2Store,
    /** Notification management */
    readonly notifications: NotificationService,
  ) {}

  /**
   * Create and initialize a MemoryService.
   */
  static async create(options: {
    db: Database;
    hooks: Emitter<HookEventMap>;
    worktreesRoot: string;
    memoryDbPath: string;
  }): Promise<MemoryService> {
    const l1 = new L1Store(options.worktreesRoot);
    const l2 = await L2Store.create(options.memoryDbPath);
    const notifications = new NotificationService(options.db, options.hooks);

    return new MemoryService(l1, l2, notifications);
  }

  /**
   * Shutdown the memory service and release resources.
   */
  async shutdown(): Promise<void> {
    await this.l2.close();
  }
}
