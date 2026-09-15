# @workhorse/events

The event log, the steer queue, and the notification bus.

These three exist because a run is durable but a stage is not. A stage session
starts, ends, and forgets. Anything that arrives between stages needs somewhere to
wait.

## Exports

| Export | What it does |
|---|---|
| `appendEvents`, `consumeEvents`, `unconsumedEvents` | The per-ticket event log in KV, with a cursor. |
| `appendSteer`, `pendingSteers`, `consumeSteers` | The steer queue. An operator interrupts a live run through it. |
| `wakeTicket` | Sends a Workflow event so a parked instance continues. |
| `notify` | Queues a notification in D1 for the next stage to read. |
| `renderNotifications` | Formats queued notifications for a prompt. |

## Notes

A steer cursor advances only after the message reaches a prompt. A session that
dies before it starts does not consume the steer.

Steer delivery was broken for months. `POST /tickets/:id/steer` validated the
request, wrote to KV, and answered `{ok: true, note: "applied on the next drive
burst"}`. The only reader was the workflow interpreter, deleted in `1f165f3`, so
every steer was accepted and discarded. The engine and the prompt assembly both
supported it. Only the wiring was missing.

Notifications differ from steers on purpose. A notification informs an agent at a
stage boundary. A steer redirects the work. Neither one sets routing state.

## Tests

`bunx vitest run packages/events`
