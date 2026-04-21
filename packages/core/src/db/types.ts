import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema";

/** Drizzle database instance type with our schema */
export type DrizzleDb = BetterSQLite3Database<typeof schema>;
