import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { CONTEXT_FILE, L1Context } from "./context.ts";
import { parseSessionMemory } from "./parse.ts";

/**
 * L1Store - L1 memory layer managing context.md files across all worktrees.
 *
 * Scans worktrees root at construction to build issueId → L1Context map.
 *
 * @example
 * ```typescript
 * const l1 = new L1Store("/path/to/worktrees-root");
 *
 * // Get context by issue ID
 * const ctx = l1.get("AM-123");
 * if (ctx) {
 *   const memory = await ctx.read();
 * }
 *
 * // List all known contexts
 * for (const [issueId, ctx] of l1.all()) {
 *   console.log(issueId, ctx.worktreePath);
 * }
 *
 * // Register a new worktree
 * const newCtx = l1.register("AM-456", "/path/to/worktree");
 * await newCtx.create("AM-456: New feature", "planning");
 * ```
 */
export class L1Store {
  private readonly contexts = new Map<string, L1Context>();

  constructor(private readonly worktreesRoot: string) {
    this.scan();
  }

  /** Get context by issue ID */
  get(issueId: string): L1Context | undefined {
    return this.contexts.get(issueId);
  }

  /** Get all issueId → L1Context entries */
  all(): Map<string, L1Context> {
    return this.contexts;
  }

  /** Register a new worktree for an issue (adds to map, does not create context.md) */
  register(issueId: string, worktreePath: string): L1Context {
    const ctx = new L1Context(worktreePath);
    this.contexts.set(issueId, ctx);
    return ctx;
  }

  /** Re-scan worktrees root and rebuild the map */
  refresh(): void {
    this.contexts.clear();
    this.scan();
  }

  /** Scan worktrees root for existing context.md files */
  private scan(): void {
    if (!existsSync(this.worktreesRoot)) return;

    for (const entry of readdirSync(this.worktreesRoot)) {
      const worktreePath = join(this.worktreesRoot, entry);
      const contextPath = join(worktreePath, CONTEXT_FILE);

      if (!statSync(worktreePath).isDirectory()) continue;
      if (!existsSync(contextPath)) continue;

      const content = readFileSync(contextPath, "utf-8");
      const memory = parseSessionMemory(content);
      // Extract issue ID from title (e.g., "AM-123: Fix bug" → "AM-123")
      const issueId = memory.title.match(/^([A-Z]+-\d+)/)?.[1];

      if (issueId) {
        this.contexts.set(issueId, new L1Context(worktreePath));
      }
    }
  }
}
