/**
 * Reusable fuzzy search utilities using Fuse.js
 * Use for skill lookup, tool search, and other name-based lookups
 */
import Fuse, { type IFuseOptions } from "fuse.js";

export interface FuzzySearchItem {
  id: string;
  name?: string;
  aliases?: string[];
}

export interface FuzzySearchOptions<T> {
  /** Keys to search on (default: ["id", "name"]) */
  keys?: string[];
  /** Fuse.js threshold - 0 = exact, 1 = match anything (default: 0.4) */
  threshold?: number;
  /** Additional Fuse.js options */
  fuseOptions?: Partial<IFuseOptions<T>>;
}

const DEFAULT_OPTIONS: IFuseOptions<FuzzySearchItem> = {
  keys: ["id", "name", "aliases"],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  findAllMatches: true,
};

/**
 * Create a fuzzy searcher for a list of items
 * @example
 * const skills = [{ id: "claude:launch-playwright", name: "Launch Playwright" }];
 * const searcher = createFuzzySearcher(skills);
 * const result = searcher.search("playwright"); // finds the skill
 */
export function createFuzzySearcher<T extends FuzzySearchItem>(
  items: T[],
  options: FuzzySearchOptions<T> = {},
): FuzzySearcher<T> {
  return new FuzzySearcher(items, options);
}

export class FuzzySearcher<T extends FuzzySearchItem> {
  private fuse: Fuse<T>;
  private itemsById: Map<string, T>;
  private itemsByBaseName: Map<string, T>;

  constructor(items: T[], options: FuzzySearchOptions<T> = {}) {
    this.fuse = new Fuse(items, {
      ...DEFAULT_OPTIONS,
      ...options.fuseOptions,
      keys: options.keys ?? DEFAULT_OPTIONS.keys,
      threshold: options.threshold ?? DEFAULT_OPTIONS.threshold,
    });
    this.itemsById = new Map(items.map((item) => [item.id, item]));
    this.itemsByBaseName = new Map();
    for (const item of items) {
      const baseName = item.id.includes(":") ? item.id.split(":").slice(1).join(":") : item.id;
      if (!this.itemsByBaseName.has(baseName)) this.itemsByBaseName.set(baseName, item);
    }
  }

  /** Get item by exact ID */
  getById(id: string): T | undefined {
    return this.itemsById.get(id);
  }

  /** Get item by base name (part after first colon) */
  getByBaseName(name: string): T | undefined {
    return this.itemsByBaseName.get(name);
  }

  /**
   * Find best match using priority: exact ID → exact base name → fuzzy match
   * Returns undefined if no good match found
   */
  findBest(query: string): T | undefined {
    const exactId = this.itemsById.get(query);
    if (exactId) return exactId;
    const exactBase = this.itemsByBaseName.get(query);
    if (exactBase) return exactBase;
    return this.fuse.search(query)[0]?.item;
  }

  /** Search and return all matches sorted by relevance */
  search(query: string, limit = 10): T[] {
    return this.fuse
      .search(query, { limit })
      .map((r) => r.item)
      .filter((item): item is T => item !== undefined);
  }

  /** Get all items */
  getAll(): T[] {
    return Array.from(this.itemsById.values());
  }
}
