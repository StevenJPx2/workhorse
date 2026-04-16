/**
 * Tests for session-parser.ts - pure parsing functions
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";
import {
  ensureJiratownDir,
  parseFrontmatter,
  parseRecentActivity,
  parseKeyDecisions,
} from "../session-parser.ts";

describe("session-parser", () => {
  describe("parseFrontmatter", () => {
    it("should parse valid frontmatter", () => {
      const content = `---
ticket_id: AM-123
status: implementing
agent: opencode
---
## Body content`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter.ticket_id).toBe("AM-123");
      expect(result.frontmatter.status).toBe("implementing");
      expect(result.frontmatter.agent).toBe("opencode");
      expect(result.body).toContain("## Body content");
    });

    it("should return empty frontmatter when no delimiters", () => {
      const content = "Just some text without frontmatter";
      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
    });

    it("should handle frontmatter with colon in value", () => {
      const content = `---
url: https://example.com/path
name: test
---
body`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.url).toBe("https://example.com/path");
      expect(result.frontmatter.name).toBe("test");
    });

    it("should handle empty frontmatter block", () => {
      const content = `---

---
body here`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toContain("body here");
    });

    it("should handle lines without colon in frontmatter", () => {
      const content = `---
ticket_id: AM-123
invalid-line
status: done
---
body`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.ticket_id).toBe("AM-123");
      expect(result.frontmatter.status).toBe("done");
    });

    it("should trim whitespace from keys and values", () => {
      const content = `---
  key  :  value  
---
body`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter["key"]).toBe("value");
    });
  });

  describe("parseRecentActivity", () => {
    it("should parse recent activity events", () => {
      const body = `## Recent Activity
- [2024-01-01T10:00:00.000Z] Started implementation
- [2024-01-01T11:00:00.000Z] Fixed bug in auth

## Next Section`;

      const events = parseRecentActivity(body);

      expect(events).toHaveLength(2);
      expect(events[0].timestamp).toBe("2024-01-01T10:00:00.000Z");
      expect(events[0].description).toBe("Started implementation");
      expect(events[0].type).toBe("agent_message");
      expect(events[1].timestamp).toBe("2024-01-01T11:00:00.000Z");
      expect(events[1].description).toBe("Fixed bug in auth");
    });

    it("should return empty array when no activity section", () => {
      const body = "## Some Other Section\nContent here";
      const events = parseRecentActivity(body);
      expect(events).toEqual([]);
    });

    it("should return empty array when activity section is empty", () => {
      const body = `## Recent Activity

## Next Section`;

      const events = parseRecentActivity(body);
      expect(events).toEqual([]);
    });

    it("should ignore lines that don't match the event format", () => {
      const body = `## Recent Activity
- [2024-01-01T10:00:00.000Z] Valid event
- Invalid line without timestamp
- Also invalid

## End`;

      const events = parseRecentActivity(body);
      expect(events).toHaveLength(1);
      expect(events[0].description).toBe("Valid event");
    });

    it("should handle activity at end of document (no next section)", () => {
      const body = `## Recent Activity
- [2024-01-01T10:00:00.000Z] Last event`;

      const events = parseRecentActivity(body);
      expect(events).toHaveLength(1);
      expect(events[0].description).toBe("Last event");
    });
  });

  describe("parseKeyDecisions", () => {
    it("should parse key decisions", () => {
      const body = `## Key Decisions
- Use PostgreSQL instead of SQLite
- Implement JWT authentication

## Next Section`;

      const decisions = parseKeyDecisions(body);

      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toBe("Use PostgreSQL instead of SQLite");
      expect(decisions[1]).toBe("Implement JWT authentication");
    });

    it("should return empty array when no decisions section", () => {
      const body = "## Some Section\nContent";
      const decisions = parseKeyDecisions(body);
      expect(decisions).toEqual([]);
    });

    it("should return empty array when decisions section is empty", () => {
      const body = `## Key Decisions

## Next Section`;

      const decisions = parseKeyDecisions(body);
      expect(decisions).toEqual([]);
    });

    it("should ignore lines that don't start with dash", () => {
      const body = `## Key Decisions
- Valid decision
Not a list item
- Another valid decision`;

      const decisions = parseKeyDecisions(body);
      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toBe("Valid decision");
      expect(decisions[1]).toBe("Another valid decision");
    });

    it("should handle decisions at end of document", () => {
      const body = `## Key Decisions
- Use TypeScript`;

      const decisions = parseKeyDecisions(body);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toBe("Use TypeScript");
    });
  });

  describe("ensureJiratownDir", () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `jiratown-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should create .jiratown directory if it does not exist", () => {
      const jiratownPath = join(testDir, ".jiratown");
      expect(existsSync(jiratownPath)).toBe(false);

      ensureJiratownDir(testDir);

      expect(existsSync(jiratownPath)).toBe(true);
    });

    it("should not throw if .jiratown directory already exists", () => {
      ensureJiratownDir(testDir); // Create it
      expect(() => ensureJiratownDir(testDir)).not.toThrow(); // Call again
    });
  });
});
