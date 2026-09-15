# @workhorse/ntfy

Push notifications for fleet events. No agent tools.

## Outbound

A ticket status change or an archived trace sends an ntfy push. Priority maps from
the event, so a failure arrives louder than a completion.

## Secrets

| Secret | Purpose |
|---|---|
| `NTFY_URL` | The ntfy server. |
| `NTFY_TOPIC` | The topic to publish to. |
| `NTFY_TOKEN` | Bearer auth. Optional — a public topic needs none. |

## Notes

The plugin stays silent when `NTFY_URL` is not set. A missing notification channel
must not fail a run.
