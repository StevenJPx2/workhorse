/** Memory Indexer - Indexes session memories and codebase context to L2. */
import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";

import { debounce } from "es-toolkit";
import { glob } from "tinyglobby";

import type { Database } from "#db";
import type { HookEmitter } from "#lib/hooks";
import type { AgentAdapter } from "#workflow/orchestrator";

import type { L1Store } from "../l1/store.ts";
import type { L2Store } from "../l2.ts";
import type { MemoryDocument, MemoryDocumentType } from "../types.ts";
import { buildSessionDocuments } from "./utils.ts";

/** Glob patterns for codebase intelligence files */
const CODEBASE_PATTERNS = ["**/README.md", "**/ARCHITECTURE.md", "docs/**/*.md", ".github/**/*.md"];
const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt"];
const MAX_FILE_SIZE = 100 * 1024;
const CODEBASE_DOC_PREFIX = "codebase:";
const DEFAULT_IDLE_DEBOUNCE_MS = 5000;

export interface MemoryIndexerOptions {
  debounceMs?: number;
}

/** Memory Indexer - Hooks into agent lifecycle to populate L2 memory. */
export class MemoryIndexer {
  private unsubscribers: Array<() => void> = [];
  private readonly debounceMs: number;

  constructor(
    private readonly l1: L1Store,
    private readonly l2: L2Store,
    private readonly hooks: HookEmitter,
    private readonly db: Database,
    options?: MemoryIndexerOptions,
  ) {
    this.debounceMs = options?.debounceMs ?? DEFAULT_IDLE_DEBOUNCE_MS;
  }

  /** Initialize hook listeners for agent.stop.post and agent.idle */
  initialize(): void {
    this.unsubscribers.push(
      this.hooks.on("agent.stop.post", async ({ adapter }) => {
        await this.indexSessionMemory(adapter);
      }),
    );
    const debouncedIdleIndex = debounce(async (payload: { issueId: string; source: string }) => {
      await this.indexSessionMemoryByIssueId(payload.issueId, payload.source);
    }, this.debounceMs);
    this.unsubscribers.push(
      this.hooks.on("agent.idle", (payload) => void debouncedIdleIndex(payload)),
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  /** Index codebase intelligence files (README, ARCHITECTURE, etc). Deduplicates automatically. */
  async indexCodebaseIntelligence(repoPath: string): Promise<number> {
    const documents: MemoryDocument[] = [];
    const seen = new Set<string>();
    for (const filePath of await glob(CODEBASE_PATTERNS, {
      cwd: repoPath,
      absolute: true,
      onlyFiles: true,
      ignore: EXCLUDED_DIRS.map((dir) => `**/${dir}/**`),
    })) {
      const relativePath = relative(repoPath, filePath);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      const docId = `${CODEBASE_DOC_PREFIX}${relativePath}`;
      const existing = await this.l2.search(docId, { limit: 1 });
      if (existing.some((r) => r.id === docId)) continue;
      try {
        const content = await this.readFileIfSmallEnough(filePath);
        if (!content) continue;
        documents.push({
          id: docId,
          content,
          metadata: {
            type: "code_context" as MemoryDocumentType,
            source: "codebase",
            filePath: relativePath,
            fileName: basename(relativePath),
          },
        });
      } catch {}
    }
    if (documents.length > 0) await this.l2.index(documents);
    return documents.length;
  }

  private async indexSessionMemory(adapter: AgentAdapter): Promise<void> {
    await this.indexSessionMemoryForIssue(adapter.issue.externalId, adapter.issue.id, "stop");
  }

  private async indexSessionMemoryByIssueId(externalId: string, source: string): Promise<void> {
    const issue = await this.db.issues.getByExternalId(externalId, source);
    if (!issue) return;
    await this.indexSessionMemoryForIssue(externalId, issue.id, "idle");
  }

  private async indexSessionMemoryForIssue(
    externalId: string,
    internalId: string,
    trigger: "idle" | "stop",
  ): Promise<void> {
    const l1Context = this.l1.get(externalId);
    if (!l1Context?.exists()) return;
    const sessionMemory = await l1Context.read();
    if (!sessionMemory) return;
    const documents = buildSessionDocuments(externalId, internalId, sessionMemory);
    if (documents.length > 0) {
      await this.l2.index(documents);
      this.hooks.emit("memory.indexed", {
        issueId: externalId,
        documentCount: documents.length,
        trigger,
      });
    }
  }

  private async readFileIfSmallEnough(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      return content.length > MAX_FILE_SIZE ? null : content;
    } catch {
      return null;
    }
  }
}
