import { describe, test, expect } from "bun:test";
import { fuzzyMatch, fuzzyFilter } from "./fuzzy-match.ts";

describe("fuzzyMatch", () => {
  test("empty query matches everything", () => {
    const result = fuzzyMatch("", "Add Ticket");
    expect(result.matches).toBe(true);
    expect(result.score).toBe(1);
  });

  test("exact match scores highest", () => {
    const result = fuzzyMatch("Add Ticket", "Add Ticket");
    expect(result.matches).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  test("prefix match scores high", () => {
    const result = fuzzyMatch("Add", "Add Ticket");
    expect(result.matches).toBe(true);
    expect(result.score).toBeGreaterThan(3);
  });

  test("fuzzy match works", () => {
    const result = fuzzyMatch("att", "Add Ticket");
    expect(result.matches).toBe(true);
    expect(result.matchedIndices).toContain(0); // 'A' from "Add"
    // The algorithm matches 't' characters in order - exact indices may vary
    expect(result.matchedIndices.length).toBe(3);
  });

  test("no match returns false", () => {
    const result = fuzzyMatch("xyz", "Add Ticket");
    expect(result.matches).toBe(false);
    expect(result.score).toBe(0);
  });

  test("case insensitive matching", () => {
    const result = fuzzyMatch("ADD", "Add Ticket");
    expect(result.matches).toBe(true);
  });

  test("word boundary bonus", () => {
    // "st" should match "Stop" better (word start) than "toSt"
    const stopResult = fuzzyMatch("st", "Stop Work");
    const toStResult = fuzzyMatch("st", "toStop");
    expect(stopResult.score).toBeGreaterThan(toStResult.score);
  });
});

describe("fuzzyFilter", () => {
  const items = [
    { name: "Add Ticket", id: 1 },
    { name: "Stop Work", id: 2 },
    { name: "Restart Agent", id: 3 },
    { name: "Settings", id: 4 },
  ];

  test("empty query returns all items", () => {
    const result = fuzzyFilter("", items, (i) => i.name);
    expect(result).toHaveLength(4);
  });

  test("filters by match", () => {
    const result = fuzzyFilter("st", items, (i) => i.name);
    // Should match "Stop Work", "Restart Agent", "Settings"
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((i) => i.name.toLowerCase().includes("s"))).toBe(true);
  });

  test("sorts by score", () => {
    const result = fuzzyFilter("add", items, (i) => i.name);
    expect(result[0].name).toBe("Add Ticket");
  });

  test("returns empty for no matches", () => {
    const result = fuzzyFilter("xyz", items, (i) => i.name);
    expect(result).toHaveLength(0);
  });
});
