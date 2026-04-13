/**
 * Tests for useDatabase hook
 */

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createRoot } from "solid-js";
import { Database } from "bun:sqlite";
import { useDatabase } from "./use-database.ts";
import { resetDatabaseRef, closeDatabase } from "#core/db/index.ts";

describe("useDatabase", () => {
  beforeEach(() => {
    // Reset database state before each test
    closeDatabase();
    resetDatabaseRef();
  });

  afterEach(() => {
    // Clean up after each test
    closeDatabase();
    resetDatabaseRef();
  });

  describe("initial state", () => {
    it("should start disconnected without autoInit", () => {
      createRoot((dispose) => {
        const { status, isConnected, error } = useDatabase();
        expect(status()).toBe("disconnected");
        expect(isConnected()).toBe(false);
        expect(error()).toBeNull();
        dispose();
      });
    });

    it("should auto-init when autoInit is true", () => {
      createRoot((dispose) => {
        const { status, isConnected } = useDatabase({ autoInit: true });
        expect(status()).toBe("connected");
        expect(isConnected()).toBe(true);
        dispose();
      });
    });
  });

  describe("init", () => {
    it("should initialize database and return instance", () => {
      createRoot((dispose) => {
        const { init, status } = useDatabase();
        const db = init();
        expect(db).toBeInstanceOf(Database);
        expect(status()).toBe("connected");
        dispose();
      });
    });

    it("should call onConnect callback on success", () => {
      createRoot((dispose) => {
        const onConnect = mock(() => {});
        const { init } = useDatabase({ onConnect });
        init();
        expect(onConnect).toHaveBeenCalledTimes(1);
        dispose();
      });
    });
  });

  describe("db", () => {
    it("should return database instance when connected", () => {
      createRoot((dispose) => {
        const { init, db } = useDatabase();
        init();
        expect(db()).toBeInstanceOf(Database);
        dispose();
      });
    });

    it("should auto-init if not connected", () => {
      createRoot((dispose) => {
        const { db, status } = useDatabase();
        expect(status()).toBe("disconnected");
        const database = db();
        expect(database).toBeInstanceOf(Database);
        expect(status()).toBe("connected");
        dispose();
      });
    });
  });

  describe("close", () => {
    it("should set status to disconnected", () => {
      createRoot((dispose) => {
        const { init, close, status, isConnected } = useDatabase();
        init();
        expect(status()).toBe("connected");
        close();
        expect(status()).toBe("disconnected");
        expect(isConnected()).toBe(false);
        dispose();
      });
    });
  });

  describe("exec", () => {
    it("should execute raw SQL", () => {
      createRoot((dispose) => {
        const { init, exec, queryAll } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_exec (id INTEGER PRIMARY KEY)");
        exec("INSERT INTO test_exec (id) VALUES (1)");

        const rows = queryAll<{ id: number }>("SELECT * FROM test_exec");
        expect(rows.length).toBe(1);
        expect(rows[0].id).toBe(1);

        // Cleanup
        exec("DROP TABLE test_exec");
        dispose();
      });
    });
  });

  describe("queryAll", () => {
    it("should return all matching rows", () => {
      createRoot((dispose) => {
        const { init, exec, queryAll } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_query (id INTEGER, name TEXT)");
        exec("INSERT INTO test_query VALUES (1, 'Alice')");
        exec("INSERT INTO test_query VALUES (2, 'Bob')");

        const rows = queryAll<{ id: number; name: string }>("SELECT * FROM test_query ORDER BY id");
        expect(rows.length).toBe(2);
        expect(rows[0].name).toBe("Alice");
        expect(rows[1].name).toBe("Bob");

        // Cleanup
        exec("DROP TABLE test_query");
        dispose();
      });
    });

    it("should support parameters", () => {
      createRoot((dispose) => {
        const { init, exec, queryAll } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_params (id INTEGER, name TEXT)");
        exec("INSERT INTO test_params VALUES (1, 'Alice')");
        exec("INSERT INTO test_params VALUES (2, 'Bob')");

        const rows = queryAll<{ id: number; name: string }>(
          "SELECT * FROM test_params WHERE name = ?",
          ["Alice"],
        );
        expect(rows.length).toBe(1);
        expect(rows[0].name).toBe("Alice");

        // Cleanup
        exec("DROP TABLE test_params");
        dispose();
      });
    });

    it("should return empty array for no matches", () => {
      createRoot((dispose) => {
        const { init, exec, queryAll } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_empty (id INTEGER)");

        const rows = queryAll<{ id: number }>("SELECT * FROM test_empty");
        expect(rows).toEqual([]);

        // Cleanup
        exec("DROP TABLE test_empty");
        dispose();
      });
    });
  });

  describe("queryOne", () => {
    it("should return first matching row", () => {
      createRoot((dispose) => {
        const { init, exec, queryOne } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_one (id INTEGER, name TEXT)");
        exec("INSERT INTO test_one VALUES (1, 'Alice')");
        exec("INSERT INTO test_one VALUES (2, 'Bob')");

        const row = queryOne<{ id: number; name: string }>(
          "SELECT * FROM test_one WHERE id = ?",
          [1],
        );
        expect(row).not.toBeNull();
        expect(row?.name).toBe("Alice");

        // Cleanup
        exec("DROP TABLE test_one");
        dispose();
      });
    });

    it("should return null for no match", () => {
      createRoot((dispose) => {
        const { init, exec, queryOne } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_null (id INTEGER)");

        const row = queryOne<{ id: number }>("SELECT * FROM test_null WHERE id = ?", [999]);
        expect(row).toBeNull();

        // Cleanup
        exec("DROP TABLE test_null");
        dispose();
      });
    });
  });

  describe("run", () => {
    it("should return number of changes", () => {
      createRoot((dispose) => {
        const { init, exec, run } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_run (id INTEGER, val TEXT)");
        exec("INSERT INTO test_run VALUES (1, 'a')");
        exec("INSERT INTO test_run VALUES (2, 'a')");
        exec("INSERT INTO test_run VALUES (3, 'b')");

        const changes = run("UPDATE test_run SET val = ? WHERE val = ?", ["updated", "a"]);
        expect(changes).toBe(2);

        // Cleanup
        exec("DROP TABLE test_run");
        dispose();
      });
    });

    it("should work without parameters", () => {
      createRoot((dispose) => {
        const { init, exec, run, queryAll } = useDatabase();
        init();

        exec("CREATE TABLE IF NOT EXISTS test_run2 (id INTEGER)");
        exec("INSERT INTO test_run2 VALUES (1)");
        exec("INSERT INTO test_run2 VALUES (2)");

        const changes = run("DELETE FROM test_run2");
        expect(changes).toBe(2);

        const remaining = queryAll("SELECT * FROM test_run2");
        expect(remaining.length).toBe(0);

        // Cleanup
        exec("DROP TABLE test_run2");
        dispose();
      });
    });
  });
});
