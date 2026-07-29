# @workhorse/intake

Getting work in, and keeping it moving.

## Exports

| Export | What it does |
|---|---|
| `createIntake(providers)` | Builds the intake surface for a set of attachment providers. |
| `intake.fileTicket` | Validates a request, normalizes the repo, resolves refs, and dispatches a durable run. |
| `intake.parseRefs` | Finds Jira, Slack, and repo references in a task prompt. |
| `intake.enrichableRefs` | Ranks recent refs by frecency for the UI. |
| `intake.resolveAttachments` | Resolves one ref to text, on demand. |
| `healTicket` | Re-dispatches an errored ticket, at most three times. |

## Notes

`fileTicket` rewrites `acme/widgets` to `https://github.com/acme/widgets.git`
before storing it. Every consumer of `ticket.repo` therefore receives a clone URL,
not a slug. Use `repoSlug` from `@workhorse/api` to get `owner/name`.

`createIntake` takes the attachment providers as an argument. `parseRefs` used to
import the plugin registry directly, which made this package import the
composition root and created a cycle.

`healTicket` refuses to re-dispatch a deterministic failure. Retrying a bad prompt
three times spends three runs to reach the same result. It also confirms the old
instance is dead before it creates a new one.

Refs come out of the prompt text. Nobody attaches them by hand.

## Tests

`bunx vitest run packages/intake`
