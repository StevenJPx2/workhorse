/**
 * useDatabase hook - SQLite connection management
 *
 * Provides reactive database connection management with
 * initialization, query helpers, and cleanup.
 */

import type { Database, SQLQueryBindings } from "bun:sqlite";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import {
  closeDatabase,
  getDatabase,
  initDatabase,
} from "../../lib/db/index.ts";

/**
 * Database connection status
 */
export type DatabaseStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * Options for the database hook
 */
export interface UseDatabaseOptions {
  /** Whether to auto-initialize on mount */
  autoInit?: boolean;
  /** Callback when connection succeeds */
  onConnect?: () => void;
  /** Callback when connection fails */
  onError?: (error: Error) => void;
}

/**
 * Return value from useDatabase hook
 */
export interface UseDatabaseReturn {
  /** Current connection status */
  status: Accessor<DatabaseStatus>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Initialize database connection */
  init: () => Database;
  /** Get current database instance (throws if not connected) */
  db: () => Database;
  /** Check if connected */
  isConnected: () => boolean;
  /** Close the database connection */
  close: () => void;
  /** Execute a raw SQL query */
  exec: (sql: string) => void;
  /** Run a query and return all results */
  queryAll: <T>(sql: string, params?: SQLQueryBindings[]) => T[];
  /** Run a query and return first result */
  queryOne: <T>(sql: string, params?: SQLQueryBindings[]) => T | null;
  /** Run an insert/update/delete and return changes */
  run: (sql: string, params?: SQLQueryBindings[]) => number;
}

/**
 * Hook for managing SQLite database connection
 *
 * @example
 * ```tsx
 * function App() {
 *   const { status, init, db, queryAll, close } = useDatabase({
 *     autoInit: true,
 *     onConnect: () => console.log('Database ready'),
 *   });
 *
 *   // Query data
 *   const tickets = () => queryAll<Ticket>('SELECT * FROM tickets');
 *
 *   return (
 *     <box>
 *       <text>Status: {status()}</text>
 *       <For each={tickets()}>
 *         {(ticket) => <text>{ticket.id}</text>}
 *       </For>
 *     </box>
 *   );
 * }
 * ```
 */
export function useDatabase(
  options: UseDatabaseOptions = {},
): UseDatabaseReturn {
  const [status, setStatus] = createSignal<DatabaseStatus>("disconnected");
  const [error, setError] = createSignal<Error | null>(null);

  const init = (): Database => {
    try {
      setStatus("connecting");
      const database = initDatabase();
      setStatus("connected");
      setError(null);
      options.onConnect?.();
      return database;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setStatus("error");
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const db = (): Database => {
    if (status() !== "connected") {
      return init();
    }
    return getDatabase();
  };

  const isConnected = (): boolean => {
    return status() === "connected";
  };

  const close = (): void => {
    closeDatabase();
    setStatus("disconnected");
  };

  const exec = (sql: string): void => {
    db().run(sql);
  };

  const queryAll = <T>(sql: string, params?: SQLQueryBindings[]): T[] => {
    const stmt = db().prepare(sql);
    if (params && params.length > 0) {
      return stmt.all(...params) as T[];
    }
    return stmt.all() as T[];
  };

  const queryOne = <T>(sql: string, params?: SQLQueryBindings[]): T | null => {
    const stmt = db().prepare(sql);
    if (params && params.length > 0) {
      return stmt.get(...params) as T | null;
    }
    return stmt.get() as T | null;
  };

  const run = (sql: string, params?: SQLQueryBindings[]): number => {
    const stmt = db().prepare(sql);
    if (params && params.length > 0) {
      return stmt.run(...params).changes;
    }
    return stmt.run().changes;
  };

  // Auto-init if requested
  if (options.autoInit) {
    init();
  }

  // Cleanup on unmount
  onCleanup(() => {
    // Note: We don't close the database here as it may be shared
    // The app should handle closing on exit
  });

  return {
    status,
    error,
    init,
    db,
    isConnected,
    close,
    exec,
    queryAll,
    queryOne,
    run,
  };
}
