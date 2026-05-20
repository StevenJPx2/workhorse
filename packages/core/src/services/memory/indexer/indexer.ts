/**
 * Memory Indexer - Automatically indexes session memories and codebase context.
 *
 * Orchestrates data flow into the memory system:
 * - Reads session memories from L1 (SQLite)
 * - Reads codebase docs from filesystem
 * - Writes searchable documents to L2 (vector store)
 *
 * Responsibilities:
 * 1. Index session summaries when agents stop (agent.stop.post hook)
 * 2. Index codebase intelligence on startup (README, key docs) - with deduplication
 *
 * @module services/memory/indexer
 */

import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";

import { glob } from "tinyglobby";

import type { HookEmitter } from "#lib/hooks";
import type { AgentAdapter } from "#workflow/orchestrator";

import type { L1Store } from "../l1/store.ts";
import type { L2Store } from "../l2.ts";
import type { MemoryDocument, MemoryDocumentType } from "../types.ts";
import { buildSessionDocuments } from "./utils.ts";

/**
 * Glob patterns for codebase intelligence files.
 * Matches documentation files that provide project context.
 */
const CODEBASE_INTELLIGENCE_PATTERNS = [
  "**/README.md",
  "**/ARCHITECTURE.md",
  "**/CONTRIBUTING.md",
  "**/CHANGELOG.md",
  "docs/**/*.md",
  ".github/**/*.md",
];

/** Directories to exclude from glob matching */
const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt"];

/** Maximum file size to index (100KB) */
const MAX_FILE_SIZE = 100 * 1024;

/** Document ID prefix for codebase intelligence documents */
const CODEBASE_DOC_PREFIX = "codebase:";

/**
 * Memory Indexer - Hooks into agent lifecycle to populate L2 memory.
 *
 * Reads from: L1 (session memories), filesystem (codebase docs)
 * Writes to: L2 (vector store for semantic search)
 */
export class MemoryIndexer {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly l1: L1Store,
    private readonly l2: L2Store,
    private readonly hooks: HookEmitter,
  ) {}

  /**
   * Initialize the indexer - sets up hook listeners.
   */
  initialize(): void {
    // Index session memory when agent stops
    this.unsubscribers.push(
      this.hooks.on("agent.stop.post", async ({ adapter }) => {
        await this.indexSessionMemory(adapter);
      }),
    );
  }

  /**
   * Dispose of hook listeners.
   */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  /**
   * Index codebase intelligence files if not already indexed.
   * Only indexes files that haven't been indexed before (deduplication).
   *
   * @param repoPath - Path to the repository root
   * @returns Number of newly indexed documents
   */
  async indexCodebaseIntelligence(repoPath: string): Promise<number> {
    const documents: MemoryDocument[] = [];
    const seen = new Set<string>();

    // Scan for files matching any of the intelligence patterns
    const filePaths = await glob(CODEBASE_INTELLIGENCE_PATTERNS, {
      cwd: repoPath,
      absolute: true,
      onlyFiles: true,
      ignore: EXCLUDED_DIRS.map((dir) => `**/${dir}/**`),
    });

    for (const filePath of filePaths) {
      const relativePath = relative(repoPath, filePath);

      // Skip duplicates (same file matched by multiple patterns)
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);

      const docId = `${CODEBASE_DOC_PREFIX}${relativePath}`;

      // Check if already indexed by searching for exact ID
      const existing = await this.l2.search(docId, { limit: 1 });
      if (existing.some((r) => r.id === docId)) {
        continue; // Already indexed
      }

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
      } catch {
        // Skip files we can't read
        continue;
      }
    }

    if (documents.length > 0) {
      await this.l2.index(documents);
    }

    return documents.length;
  }

  /**
   * Index session memory from an agent that just stopped.
   */
  private async indexSessionMemory(adapter: AgentAdapter): Promise<void> {
    const issueId = adapter.issue.externalId;
    const l1Context = this.l1.get(issueId);

    if (!l1Context?.exists()) return;

    const sessionMemory = await l1Context.read();
    if (!sessionMemory) return;

    const documents = buildSessionDocuments(issueId, adapter.issue.id, sessionMemory);

    if (documents.length > 0) {
      await this.l2.index(documents);
    }
  }

  /**
   * Read file content if it's small enough to index.
   */
  private async readFileIfSmallEnough(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      if (content.length > MAX_FILE_SIZE) {
        return null;
      }
      return content;
    } catch {
      return null;
    }
  }
}
