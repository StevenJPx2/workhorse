import { createRetriv, type SearchFilter } from "retriv";
import { libsql } from "retriv/db/libsql";
import { transformersJs } from "retriv/embeddings/transformers-js";
import type { MemoryDocument, MemorySearchOptions, SearchResult } from "./types.ts";

/** Type for the retriv instance */
type RetrivInstance = Awaited<ReturnType<typeof createRetriv>>;

/**
 * L2 Memory Store - Hybrid search using retriv (FTS5 + vector embeddings).
 *
 * This provides semantic search capabilities for long-term memory:
 * - Session memories
 * - Issue context
 * - Decisions
 * - Code context
 * - Plugin-defined document types (e.g., VCS plugins can add "pr_context")
 *
 * @example
 * ```typescript
 * const store = await L2Store.create("/path/to/memory.db");
 *
 * await store.index([
 *   { id: "doc-1", content: "User authentication flow...", metadata: { type: "decision", issueId: "AM-123" } }
 * ]);
 *
 * const results = await store.search("how does auth work?", { limit: 5 });
 * await store.close();
 * ```
 */
export class L2Store {
  private retriv: RetrivInstance;
  private closed = false;

  /**
   * Private constructor - use L2Store.create() instead.
   */
  private constructor(retriv: RetrivInstance) {
    this.retriv = retriv;
  }

  /**
   * Create and initialize a new L2 store.
   *
   * @param dbPath - Path to the SQLite database file for memory storage
   * @returns Initialized L2Store instance
   *
   * @example
   * ```typescript
   * const store = await L2Store.create("/path/to/memory.db");
   * ```
   */
  static async create(dbPath: string): Promise<L2Store> {
    // Use libsql for Bun compatibility (node:sqlite requires Node.js 22.5+)
    return new L2Store(
      await createRetriv({
        driver: libsql({
          url: `file:${dbPath}`,
          embeddings: transformersJs({ model: "Xenova/all-MiniLM-L6-v2" }),
        }),
      }),
    );
  }

  /**
   * Index documents for search.
   *
   * @param documents - Documents to index
   */
  async index(documents: MemoryDocument[]): Promise<void> {
    await this.retriv.index(
      documents.map((doc) => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
      })),
    );
  }

  /**
   * Search for documents matching a query.
   *
   * @param query - Search query (natural language)
   * @param options - Search options (limit, filter, returnContent)
   * @returns Array of search results with scores
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, filter, returnContent = false } = options;

    return (
      await this.retriv.search(query, {
        limit,
        filter: filter ? buildFilter(filter) : undefined,
        returnContent,
      })
    ).map((r) => ({
      id: r.id,
      score: r.score,
      content: returnContent ? r.content : undefined,
      metadata: r.metadata,
    }));
  }

  /**
   * Remove documents by ID.
   *
   * @param ids - Document IDs to remove
   */
  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if (!this.retriv.remove) {
      throw new Error("L2Store: remove operation not supported by this driver");
    }
    await this.retriv.remove(ids);
  }

  /**
   * Close the store and release resources.
   * Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.retriv.close) {
      await this.retriv.close();
    }
  }
}

/**
 * Build a retriv filter from our MemorySearchOptions filter.
 *
 * Converts our simple filter object to retriv's filter format.
 */
function buildFilter(filter: NonNullable<MemorySearchOptions["filter"]>): SearchFilter {
  const result: SearchFilter = {};

  for (const [key, value] of Object.entries(filter)) {
    if (
      value !== undefined &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    ) {
      result[key] = value;
    }
  }

  return result;
}
