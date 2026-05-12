import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema";

/** Drizzle database instance type with our schema */
export type DrizzleDb = LibSQLDatabase<typeof schema>;
