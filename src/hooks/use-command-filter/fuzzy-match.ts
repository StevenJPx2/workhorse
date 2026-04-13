/**
 * Fuzzy matching utilities for command filtering
 *
 * Implements a simple fuzzy matching algorithm that matches characters
 * in order (not necessarily consecutive). Case-insensitive.
 */

export interface FuzzyMatch {
  /** Whether the query matches the text */
  matches: boolean;
  /** Score (higher is better match) - 0 if no match */
  score: number;
  /** Indices of matched characters in the original text */
  matchedIndices: number[];
}

/**
 * Perform fuzzy matching of a query against text
 *
 * @example
 * fuzzyMatch("att", "Add Ticket") // matches: true, score: high
 * fuzzyMatch("xyz", "Add Ticket") // matches: false, score: 0
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  if (!query) {
    return { matches: true, score: 1, matchedIndices: [] };
  }

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const matchedIndices: number[] = [];

  let queryIndex = 0;
  let consecutiveMatches = 0;
  let score = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      matchedIndices.push(i);

      // Bonus for consecutive matches
      if (matchedIndices.length > 1 && i === matchedIndices[matchedIndices.length - 2] + 1) {
        consecutiveMatches++;
        score += 2;
      } else {
        consecutiveMatches = 0;
        score += 1;
      }

      // Bonus for matching at word boundaries
      if (i === 0 || text[i - 1] === " " || text[i - 1] === "-" || text[i - 1] === "_") {
        score += 3;
      }

      // Bonus for exact case match
      if (text[i] === query[queryIndex]) {
        score += 0.5;
      }

      queryIndex++;
    }
  }

  const matches = queryIndex === queryLower.length;

  if (!matches) {
    return { matches: false, score: 0, matchedIndices: [] };
  }

  // Normalize score by query length for fair comparison
  const normalizedScore = score / query.length;

  return { matches, score: normalizedScore, matchedIndices };
}

/**
 * Filter and sort items by fuzzy match score
 *
 * @param query - Search query
 * @param items - Items to filter
 * @param getText - Function to get searchable text from item
 * @returns Filtered items sorted by match score (best first)
 */
export function fuzzyFilter<T>(query: string, items: T[], getText: (item: T) => string): T[] {
  if (!query.trim()) {
    return items;
  }

  const results: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const text = getText(item);
    const match = fuzzyMatch(query, text);
    if (match.matches) {
      results.push({ item, score: match.score });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.map((r) => r.item);
}
