import BetterSqlite from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { IssueController, EventController, NotificationController } from "./controllers";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Database class that provides access to all data controllers.
 *
 * @example
 * ```typescript
 * const db = new Database(":memory:"); // for tests
 * const db = new Database("/path/to/jiratown.db"); // for production
 *
 * // Issues
 * const issue = db.issues.insert({ ... });
 * const found = db.issues.getById("abc-123");
 *
 * // Events
 * db.events.insert({ issueId: "abc-123", type: "comment", message: "..." });
 *
 * // Notifications
 * db.notifications.create({ ... });
 * db.notifications.markRead("notif-1");
 *
 * db.close();
 * ```
 */
export class Database {
  private sqlite: BetterSqlite.Database;
  private db: BetterSQLite3Database<typeof schema>;

  /** Issue CRUD operations */
  public readonly issues: IssueController;

  /** Issue event operations */
  public readonly events: EventController;

  /** Notification operations */
  public readonly notifications: NotificationController;

  /**
   * Create a new Database instance.
   *
   * @param path - Path to the SQLite database file, or ":memory:" for in-memory database
   */
  constructor(path: string) {
    this.sqlite = new BetterSqlite(path);
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec("PRAGMA busy_timeout = 5000;");

    this.db = drizzle(this.sqlite, { schema });

    const currentDir = dirname(fileURLToPath(import.meta.url));
    migrate(this.db, { migrationsFolder: join(currentDir, "../../drizzle") });

    this.issues = new IssueController(this.db);
    this.events = new EventController(this.db);
    this.notifications = new NotificationController(this.db);
  }

  /**
   * Close the database connection.
   * Should be called when done using the database.
   */
  close(): void {
    this.sqlite.close();
  }
}
