# @workhorse/o11y

Structured events, keyed by ticket, run, and stage.

A ticket's life spans a Worker request, a durable Workflow instance, and several
sandboxed stage sessions. Before this package, those correlated only if you grepped
a ticket id out of unstructured log lines.

Built on [evlog](https://github.com/hugorcd/evlog): no runtime dependencies, a
Workers adapter, and an OTLP drain when one is wanted.

## Exports

| Export | What it does |
|---|---|
| `initLogging(options)` | Configures the Workers logger. Call once at module scope. |
| `log` | The evlog logger: `info`, `warn`, `error`. |
| `ticketEvent(e)` | Builds a ticket-lifecycle event. |
| `stageEvent(e)` | Builds a stage event, with the stage identity guaranteed. |

## Usage

```ts
log.info(stageEvent({ ticketId, runId, repo, stage: "review", event: "stage-complete" }));
```

## Notes

Two builders are the whole vocabulary. Free-form logging lets every call site invent
its own field names. A query for "how long does the review stage take" then depends
on whoever wrote that line choosing `stage` over `stageId` or `phase`.

Events are flat. Nested objects do not index as separate fields in most log
backends.

`stringify` is false. Cloudflare's pipeline stores an object and indexes its
fields. A JSON string makes every field a substring of one blob.

The wired call sites are stage transitions, heal outcomes, and throttle parks. A
park is invisible in the ticket record, so an hour spent waiting for model capacity
otherwise looks the same as an hour spent working.

## Tests

`bunx vitest run packages/o11y`
