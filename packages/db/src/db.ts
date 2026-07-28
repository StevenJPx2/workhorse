// The relational plane, as one injected object composed of per-table repos.
//
// Constructed ONCE per request/run and passed down, rather than every function
// taking `env` and re-deriving a connection. `drizzle(env.DB)` is cheap but not
// free, and threading `env` purely to reach the database made every caller depend
// on the whole environment to do one query.
//
// Each repo is a directory of plain functions taking the connection first; `bind`
// applies it once and DERIVES the resulting type, so `db.tickets.list()` is fully
// typed and adding an operation touches only that directory. No hand-written
// interface to keep in sync, and no base class holding a single field.

import { drizzle } from "drizzle-orm/d1";
import { bind, type Bound } from "./repos/bind";
import * as escalationFns from "./repos/escalations";
import * as notificationFns from "./repos/notifications";
import * as scriptFns from "./repos/scripts";
import * as ticketFns from "./repos/tickets";
import * as traceFns from "./repos/traces";

/** The composed database surface. Inferred — see the note above. */
export interface Db {
  tickets: Bound<typeof ticketFns>;
  escalations: Bound<typeof escalationFns>;
  traces: Bound<typeof traceFns>;
  notifications: Bound<typeof notificationFns>;
  scripts: Bound<typeof scriptFns>;
}

/** Build the database surface over a D1 binding. */
export function createDb(binding: D1Database): Db {
  // ONE drizzle instance shared by every repo — a per-repo connection would
  // multiply setup cost by table count for no benefit.
  const d = drizzle(binding);

  return {
    tickets: bind(d, ticketFns),
    escalations: bind(d, escalationFns),
    traces: bind(d, traceFns),
    notifications: bind(d, notificationFns),
    scripts: bind(d, scriptFns),
  };
}
