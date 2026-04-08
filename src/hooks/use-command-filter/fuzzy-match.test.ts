/**
 * Tests for fuzzy matching utilities
 */

import { describe, expect, it } from "bun:test";
import { fuzzyMatch, fuzzyFilter } from "./fuzzy-match.ts";

describe("fuzzyMatch", () => {
  describe("basic matching", () => {
    it("should match exact text", () => {
      const result = fuzzyMatch("add", "add");
      expect(result.matches).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it("should match substring", () => {
      const result = fuzzyMatch("add", "Add Ticket");
      expect(result.matches).toBe(true);
    });

    it("should match fuzzy pattern", () => {
      const result = fuzzyMatch("att", "Add Ticket");
      expect(result.matches).toBe(true);
      // Matches: A(0), T(4), t(9) in "Add Ticket"
      expect(result.matchedIndices).toEqual([0, 4, 9]);
    });

    it("should not match when characters are out of order", () => {
      const result = fuzzyMatch("tad", "Add Ticket");
      expect(result.matches).toBe(false);
      expect(result.score).toBe(0);
    });

    it("should not match when query has extra characters", () => {
      const result = fuzzyMatch("addxyz", "Add");
      expect(result.matches).toBe(false);
    });
  });

  describe("case insensitivity", () => {
    it("should match regardless of case", () => {
      expect(fuzzyMatch("ADD", "add").matches).toBe(true);
      expect(fuzzyMatch("add", "ADD").matches).toBe(true);
      expect(fuzzyMatch("AdD", "aDD").matches).toBe(true);
    });

    it("should give bonus for exact case match", () => {
      const exactCase = fuzzyMatch("Add", "Add Ticket");
      const differentCase = fuzzyMatch("add", "Add Ticket");
      expect(exactCase.score).toBeGreaterThan(differentCase.score);
    });
  });

  describe("empty query", () => {
    it("should match everything with empty query", () => {
      const result = fuzzyMatch("", "Add Ticket");
      expect(result.matches).toBe(true);
      expect(result.matchedIndices).toEqual([]);
    });
  });

  describe("scoring", () => {
    it("should score consecutive matches higher", () => {
      const consecutive = fuzzyMatch("add", "Add Ticket");
      const spread = fuzzyMatch("aik", "Add Ticket"); // A-i-k more spread out
      expect(consecutive.score).toBeGreaterThan(spread.score);
    });

    it("should score word boundary matches higher", () => {
      const boundary = fuzzyMatch("at", "Add Ticket"); // A and T at boundaries
      const middle = fuzzyMatch("dd", "Add Ticket"); // dd in middle
      expect(boundary.score).toBeGreaterThan(middle.score);
    });
  });
});

describe("fuzzyFilter", () => {
  interface Item {
    id: string;
    label: string;
  }

  const items: Item[] = [
    { id: "add-ticket", label: "Add New Ticket" },
    { id: "toggle-theme", label: "Toggle Theme" },
    { id: "quit", label: "Quit Application" },
    { id: "show-help", label: "Show Help" },
  ];

  const getText = (item: Item) => item.label;

  it("should return all items for empty query", () => {
    const result = fuzzyFilter("", items, getText);
    expect(result).toEqual(items);
  });

  it("should return all items for whitespace query", () => {
    const result = fuzzyFilter("   ", items, getText);
    expect(result).toEqual(items);
  });

  it("should filter to matching items", () => {
    const result = fuzzyFilter("ticket", items, getText);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("add-ticket");
  });

  it("should handle fuzzy patterns", () => {
    const result = fuzzyFilter("ant", items, getText);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("add-ticket"); // "A"dd "N"ew "T"icket
  });

  it("should return empty array when nothing matches", () => {
    const result = fuzzyFilter("xyz", items, getText);
    expect(result.length).toBe(0);
  });

  it("should sort by score (best match first)", () => {
    const result = fuzzyFilter("th", items, getText);
    // "Toggle Theme" should rank higher than others with "th"
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe("toggle-theme");
  });

  it("should handle multiple matches sorted by relevance", () => {
    // Both "Show Help" and "Toggle Theme" have 'h'
    const result = fuzzyFilter("h", items, getText);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
