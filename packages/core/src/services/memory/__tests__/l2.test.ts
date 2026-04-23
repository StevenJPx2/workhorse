import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { L2Store } from "../l2.ts";
import type { MemoryDocument } from "../types.ts";

const TEST_DIR = join(import.meta.dirname, ".test-l2");
const DB_PATH = join(TEST_DIR, "memory.db");

describe("L2: Semantic Search (retriv)", () => {
  let store: L2Store | null = null;

  beforeEach(async () => {
    // Clean up before each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after each test
    if (store) {
      await store.close();
      store = null;
    }
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("initialization", () => {
    it("creates successfully via static factory", async () => {
      store = await L2Store.create(DB_PATH);
      expect(store).toBeInstanceOf(L2Store);
    });
  });

  describe("indexing", () => {
    beforeEach(async () => {
      store = await L2Store.create(DB_PATH);
    });

    it("indexes a single document", async () => {
      const doc: MemoryDocument = {
        id: "doc-1",
        content: "Authentication flow uses JWT tokens for session management",
        metadata: { type: "decision", issueId: "AM-123" },
      };

      await store!.index([doc]);

      // Search to verify it was indexed
      const results = await store!.search("JWT authentication");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.id).toBe("doc-1");
    });

    it("indexes multiple documents", async () => {
      const docs: MemoryDocument[] = [
        {
          id: "doc-1",
          content: "User registration requires email verification",
          metadata: { type: "decision", issueId: "AM-100" },
        },
        {
          id: "doc-2",
          content: "Password reset flow sends email with reset link",
          metadata: { type: "decision", issueId: "AM-101" },
        },
        {
          id: "doc-3",
          content: "Database migrations use drizzle-kit generate",
          metadata: { type: "code_context", issueId: "AM-102" },
        },
      ];

      await store!.index(docs);

      const results = await store!.search("email");
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("searching", () => {
    beforeEach(async () => {
      store = await L2Store.create(DB_PATH);

      // Index test documents
      const docs: MemoryDocument[] = [
        {
          id: "auth-1",
          content: "Authentication uses bcrypt for password hashing with 12 salt rounds",
          metadata: { type: "decision", issueId: "AM-100" },
        },
        {
          id: "auth-2",
          content: "JWT tokens expire after 24 hours, refresh tokens last 7 days",
          metadata: { type: "decision", issueId: "AM-100" },
        },
        {
          id: "db-1",
          content: "PostgreSQL database with drizzle ORM for type-safe queries",
          metadata: { type: "code_context", issueId: "AM-101" },
        },
        {
          id: "test-1",
          content: "Unit tests use vitest with coverage reporting enabled",
          metadata: { type: "code_context", issueId: "AM-102" },
        },
      ];

      await store!.index(docs);
    });

    it("returns relevant results for semantic query", async () => {
      const results = await store!.search("how are passwords stored");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.id).toBe("auth-1"); // Should match bcrypt/hashing doc
    });

    it("respects limit option", async () => {
      const results = await store!.search("authentication", { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("filters by metadata", async () => {
      const results = await store!.search("code", {
        filter: { type: "code_context" },
      });

      for (const result of results) {
        expect(result.metadata?.type).toBe("code_context");
      }
    });

    it("filters by issueId", async () => {
      const results = await store!.search("authentication", {
        filter: { issueId: "AM-100" },
      });

      for (const result of results) {
        expect(result.metadata?.issueId).toBe("AM-100");
      }
    });

    it("returns content when requested", async () => {
      const results = await store!.search("bcrypt", { returnContent: true, limit: 1 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.content).toBeDefined();
      expect(results[0]!.content).toContain("bcrypt");
    });

    it("does not return content by default", async () => {
      const results = await store!.search("bcrypt", { limit: 1 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.content).toBeUndefined();
    });

    it("returns scores with results", async () => {
      const results = await store!.search("password hashing");
      expect(results.length).toBeGreaterThan(0);
      expect(typeof results[0]!.score).toBe("number");
      expect(results[0]!.score).toBeGreaterThan(0);
    });
  });

  describe("removal", () => {
    beforeEach(async () => {
      store = await L2Store.create(DB_PATH);

      await store!.index([
        { id: "to-remove", content: "This will be removed", metadata: { type: "decision" } },
        { id: "to-keep", content: "This will stay", metadata: { type: "decision" } },
      ]);
    });

    it("removes documents by id", async () => {
      // Verify it exists
      let results = await store!.search("removed", { limit: 5 });
      const initialIds = results.map((r) => r.id);
      expect(initialIds).toContain("to-remove");

      // Remove it
      await store!.remove(["to-remove"]);

      // Verify it's gone
      results = await store!.search("removed", { limit: 5 });
      const remainingIds = results.map((r) => r.id);
      expect(remainingIds).not.toContain("to-remove");
    });

    it("handles empty removal array gracefully", async () => {
      await expect(store!.remove([])).resolves.not.toThrow();
    });
  });

  describe("close", () => {
    it("closes gracefully", async () => {
      store = await L2Store.create(DB_PATH);
      await store.close();
      store = null; // Mark as closed so afterEach doesn't try again
    });

    it("can be called multiple times", async () => {
      store = await L2Store.create(DB_PATH);
      await store.close();
      await store.close(); // Should not throw
      store = null;
    });
  });
});
