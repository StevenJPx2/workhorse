# @workhorse/jira

The Jira half of the fleet. Webhooks in, transitions out. No agent tools.

## Inbound

Workhorse files a ticket when somebody assigns an issue to the agent account, or
labels it `workhorse`. Issue comments reach the notification bus.

## Outbound

A ticket status change transitions the issue and posts the PR link.

## Attachment providers

`jira` — resolves an issue and its comments on demand through `fetch_context`.

## Triggers

`jira-mention`, a trigger source for `Core.fireTrigger`.

## Secrets

| Secret | Purpose |
|---|---|
| `JIRA_BASE_URL` | The instance URL. |
| `JIRA_EMAIL` | The account the API token belongs to. |
| `JIRA_API_TOKEN` | Authenticates API calls. |
| `JIRA_WEBHOOK_SECRET` | Verifies the webhook. |
| `JIRA_AGENT_ACCOUNT` | The account id that assignment watches. |

## Notes

This group is all-or-nothing. A base URL without a token cannot transition
anything, and `bun run secrets` reports a half-configured group as a failure.

Assignment is the filing signal, not a comment. An issue mentioning the agent in
prose does not start a run.
