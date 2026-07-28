// The relational plane, as one injected object composed of per-table repositories.
//
// Constructed ONCE per request/run and passed down, rather than every function
// taking `env` and re-deriving a connection. `drizzle(env.DB)` is cheap but not
// free, and threading `env` purely to reach the database made every caller depend
// on the whole environment to do one query.
//
// Composition rather than one wide class: `db.tickets.list()` puts the table in
// the noun position, and a new table is a new file plus one field here — not
// another method on a class that only grows.

import { drizzle } from "drizzle-orm/d1";
import { EscalationsRepo } from "./repos/escalations";
import { NotificationsRepo } from "./repos/notifications";
import { ScriptsRepo } from "./repos/scripts";
import { TicketsRepo } from "./repos/tickets";
import { TracesRepo } from "./repos/traces";

export class Db {
  readonly tickets: TicketsRepo;
  readonly escalations: EscalationsRepo;
  readonly traces: TracesRepo;
  readonly notifications: NotificationsRepo;
  readonly scripts: ScriptsRepo;

  constructor(binding: D1Database) {
    // ONE drizzle instance shared by every repo — a per-repo connection would
    // multiply setup cost by table count for no benefit.
    const d = drizzle(binding);

    this.tickets = new TicketsRepo(d);
    this.escalations = new EscalationsRepo(d);
    this.traces = new TracesRepo(d);
    this.notifications = new NotificationsRepo(d);
    this.scripts = new ScriptsRepo(d);
  }
}
