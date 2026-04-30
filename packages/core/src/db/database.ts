import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { type LibSQLDatabase, drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { EventController, IssueController, NotificationController } from "./controllers";
import * as schema from "./schema";

function resolveMigrationsFolder(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(thisDir, "../../drizzle"),
    join(thisDir, "../drizzle"),
    join(thisDir, "../../src/drizzle"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(`Could not find drizzle migrations folder from ${thisDir}`);
}

/**
 * Database class that provides access to all data controllers.
 *
 * @example
 * ```typescript
 * const db = await Database.create(":memory:"); // for tests
 * const db = await Database.create("/path/to/jiratown.db"); // for production
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
  private client: Client;
  private db: LibSQLDatabase<typeof schema>;

  /** Issue CRUD operations */
  public readonly issues: IssueController;

  /** Issue event operations */
  public readonly events: EventController;

  /** Notification operations */
  public readonly notifications: NotificationController;

  /**
   * Private constructor - use Database.create() instead.
   */
  private constructor(client: Client, db: LibSQLDatabase<typeof schema>) {
    this.client = client;
    this.db = db;

    this.issues = new IssueController(this.db);
    this.events = new EventController(this.db);
    this.notifications = new NotificationController(this.db);
  }

  /**
   * Create a new Database instance.
   *
   * @param path - Path to the SQLite database file, or ":memory:" for in-memory database
   */
  static async create(path: string): Promise<Database> {
    // Ensure parent directory exists for file-based databases
    if (path !== ":memory:") {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // libsql uses file: prefix for local files
    const url = path === ":memory:" ? ":memory:" : `file:${path}`;

    const client = createClient({ url });

    // Set pragmas
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.execute("PRAGMA foreign_keys = ON;");
    await client.execute("PRAGMA busy_timeout = 5000;");

    const db = drizzle({ client, schema });

    await migrate(db, {
      migrationsFolder: resolveMigrationsFolder(),
    });

    return new Database(client, db);
  }

  /**
   * Close the database connection.
   * Should be called when done using the database.
   */
  close(): void {
    this.client.close();
  }
}
