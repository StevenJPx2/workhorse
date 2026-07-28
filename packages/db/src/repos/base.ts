// Shared base for the per-table repositories composed onto `Db`.
//
// Each table gets its own class so call sites read as `db.tickets.list()` rather
// than `db.listTickets()` — the table is the noun, the method is the verb, and a
// new table adds a file instead of more methods to one growing class.

import type { DrizzleD1Database } from "drizzle-orm/d1";

export abstract class Repo {
  constructor(protected readonly d: DrizzleD1Database) {}
}
