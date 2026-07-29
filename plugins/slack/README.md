# @workhorse/slack

The Slack half of the fleet. Webhooks in, thread replies out. No agent tools.

## Inbound

An @mention starts a fleet chat, or fires a named trigger with `trigger <name>`.
Thread replies reach the notification bus. A live run treats a reply as urgent.

## Outbound

A ticket status change posts a reply in the originating thread.

## Attachment providers

`slack` — resolves a thread on demand through `fetch_context`.

## Triggers

`slack-mention`, a trigger source for `Core.fireTrigger`.

## Secrets

| Secret | Purpose |
|---|---|
| `SLACK_SIGNING_SECRET` | Verifies the webhook HMAC. |
| `SLACK_BOT_TOKEN` | Authenticates bot API calls. |

## Notes

Both secrets are required together. A signing secret without a bot token verifies
deliveries it cannot answer, which is worse than being switched off because it looks
configured. `bun run secrets` treats this group as all-or-nothing.

A thread is resolved on demand, not inlined at filing time. Most threads are longer
than the part that matters.
