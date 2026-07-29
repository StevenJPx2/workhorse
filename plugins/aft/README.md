# @workhorse/aft

Structural code intelligence: outlines, symbols, search, and diagnostics.

## Tools

| Tool | What it does |
|---|---|
| `aft_outline` | The symbol structure of a file or directory. |
| `aft_zoom` | The full source of one named symbol. |
| `aft_search` | A regex search across the tree. |
| `aft_inspect` | Diagnostics, dead code, duplicates, and metrics. |

## Notes

The `aft` binary is a JSON-RPC server that reads one request per line from stdin.
It is not an argv CLI.

All five tools were once silently inert. The helper shelled out as `aft outline
--json <file>`, and the binary ignored argv, saw stdin closed, and exited 0 with
empty output. The helper checked the exit code, saw success, and returned "(no
output)". A crash would have been caught the first time a stage used one.

The binary emits unsolicited notification lines between replies, so the transport
matches a reply to its request by id. Matching by position hands one request another
request's answer.

`aft_search` is regex, not AST. Its documented `$VAR` meta-variables never worked,
because the underlying command is `grep`. AFT also ignores unknown parameters
silently, so the old `lang` filter was accepted and did nothing. Only `path`
narrows a search.

There is no `aft_edit`. The protocol has no symbol-level write, and an aft-side
write would bypass the stage write gate.

In the container the binary is not on the path. It lives under
`~/.cache/aft/bin/v*/aft`.

## Tests

```
bunx vitest run plugins/aft          # mocked
bun run test:contract                # against the real binary
```
