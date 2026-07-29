# @workhorse/tickets

Ticket CRUD, the attachment surface, and the fleet-chat tools.

## Tools

| Tool | Surface | What it does |
|---|---|---|
| `fetch_context` | stage | Resolves one repo, Jira, or Slack ref on demand. |
| `workhorse_file_ticket` | chat | Files a ticket. |
| `workhorse_list_tickets` | chat | Lists the fleet. |
| `workhorse_ticket_status` | chat | Reports one ticket. |
| `workhorse_ticket_diff` | chat | Shows a run's diff. |
| `workhorse_find_workflow` | chat | Ranks workflows for a task through semindex. |

The `workhorse_*` tools belong to the chat surface. No stage allowlist includes
them, which is what stops an agent from filing tickets for itself.

## Routes

Ticket CRUD and dispatch, `/refs` for frecency-ranked recent refs,
`/attachments/match` and `/attachments/resolve`, and the notification bus.

## Attachment providers

`repo` — the source behind "attach a repo".

## Notes

`fetch_context` is on-demand by design. Inlining every referenced Jira issue and
Slack thread into the prompt spends context on material the agent may not read.

This package is the plugin named `tickets`. The extracted filing and healing
package is `@workhorse/intake`, renamed because two packages cannot share a name.

## Tests

`bunx vitest run plugins/tickets`
