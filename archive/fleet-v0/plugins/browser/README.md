# @workhorse/browser

A stateful browser session for the run, over the
[agent-browser](https://github.com/vercel-labs/agent-browser) CLI.

## Tools

| Tool | What it does |
|---|---|
| `browser_open` | Navigates, then waits for a load state. |
| `browser_snapshot` | The accessibility tree with interaction refs. |
| `browser_read` | The page text. |
| `browser_act` | Clicks, fills, or types against a ref. |
| `browser_key` | Presses one key. |
| `browser_scroll` | Scrolls in a direction. |
| `browser_screenshot` | Captures a PNG. |
| `browser_record` | Records the session and converts it to a GIF. |

## Notes

Headful Chrome runs under Xvfb. Bot walls block headless browsers
deterministically, not probabilistically. Against a PerimeterX-protected site,
headless failed three times out of three. Headful passed three out of three.
Changing the browser provider does not help. Kernel headless hit the identical
block.

The `batch` subcommand silently drops `--headed`, producing a launch identical to
headless. `AGENT_BROWSER_HEADED=1` is read at launch whatever the subcommand, so it
survives batch. This matters because `browser_open` uses batch to combine the
navigation and the wait.

`--json` wraps every response in `{success, data, error}`. Unwrapping is shared,
because returning the envelope hands the agent `{"success":true,…}` to reason about
instead of the page.

`browser_key` and `browser_scroll` are separate tools rather than modes of
`browser_act`. The CLI takes a key name and a direction, not a selector, so no
amount of care makes them fit a ref-first tool.

A stale daemon keeps serving whatever provider it launched with. A leftover Kernel
daemon makes every local command fail with 401.

## Tests

```
bunx vitest run plugins/browser   # mocked
bun run test:contract             # real CLI against a local fixture page
```

The contract suite found five shipped bugs that 84 mocked tests had pinned as
correct. Two were wrong CLI signatures. One was a flag that does not exist.
