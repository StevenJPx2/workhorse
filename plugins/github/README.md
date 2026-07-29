# @workhorse/github

The GitHub half of the fleet: webhooks in, PR comments out, read-only tools for
agents.

## Tools

| Tool | What it does |
|---|---|
| `gh_pr` | PR details, files, or comments. |
| `gh_ci` | Workflow runs and job results. |
| `gh_issue` | Issue details and comments. |
| `gh_search_code` | Code search across a repo. |
| `gh_commits` | Commit list or one commit. |

Every tool goes through a scoped proxy that allows only GET.

## Webhooks

A PR or issue event files a ticket. A merge marks the ticket done. A close
terminates it. PR comments reach the notification bus. A status change posts a
comment that states what changed.

## Secrets

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | The fleet PAT for API reads and pushes. |
| `GITHUB_WEBHOOK_SECRET` | Verifies the webhook HMAC. |

## Notes

`repoSlug(ctx, explicit)` normalizes both inputs to `owner/name`. It has to.
`ctx.ticket.repo` is a clone URL in production, because `fileTicket` rewrites
`acme/x` to `https://github.com/acme/x.git` before storing it. Returning it
verbatim built paths like `/repos/https://github.com/acme/x.git/pulls/42`, and
every tool here sent that to the API.

That bug survived 66 passing tests, because the fake tool context used a bare
`acme/widgets` — a shape production never stores.

## Tests

`bunx vitest run plugins/github`
