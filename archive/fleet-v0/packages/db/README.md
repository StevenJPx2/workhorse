# @workhorse/db

The D1 schema, its migrations, and every query the fleet runs.

No other package writes SQL. The worker held raw `env.DB.prepare(...)` strings and
hand-written row mappers before this package existed.

## Structure

One file per table, and one file per operation.

```
src/schema/tickets.ts        the table
src/repos/tickets/get.ts     one operation, connection first
src/repos/tickets/index.ts   bind() applies the connection
```

`bind()` derives the repo type from the functions, so nobody writes an interface by
hand and none can drift. Adding an operation touches only its own directory.

## API

```ts
const d = db(env);            // memoized per env
await d.tickets.list();
await d.scripts.register(draft);
```

| Repo | Operations |
|---|---|
| `db.tickets` | `get`, `list`, `put`, `patch` |
| `db.scripts` | `list`, `get`, `register`, `remove`, `all` |
| `db.escalations` | `record`, `forRun` |
| `db.traces` | `index`, `list` |
| `db.notifications` | `queue`, `unread`, `markRead`, `list` |

`validateScript` and `VALID_GATES` guard script registration at the boundary.

## Migrations

```
bun run db:generate        # schema.ts -> worker/migrations
bun run db:migrate         # apply to local D1
bun run db:migrate:remote  # apply to production
bun run db:studio          # browse the local database
```

## Notes

The `0000_baseline.sql` migration uses `IF NOT EXISTS` on purpose. Production
already held the tables when Drizzle arrived, and Drizzle does not emit that
clause. The baseline adopted a live database with 47 tickets and lost no rows.

`statusGates` is typed `string[]`, not `TicketStatus[]`. `validateScript` enforces
membership at the registration boundary. Narrowing the column would force a cast at
every call site, to buy a guarantee the validator already gives.

## Tests

`bunx vitest run --project db`

These run inside workerd against a real D1, and they apply the same generated
migrations that production uses. A schema change that fails to migrate fails the
tests.
