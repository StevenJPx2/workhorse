# @workhorse/core

The workspace tools every stage draws from.

## Tools

| Group | Tools |
|---|---|
| `coreReadTools` | `read`, `ls`, `find`, `grep` |
| `coreWriteTools` | `write`, `edit`, `bash` |
| `coreTools` | both groups |

`bash` counts as a write tool. It can run anything.

## Notes

These used to be closures the worker built inline over the sandbox handle, so an
agent could reference them only by name. As ordinary tool factories they are
importable, and `tools: [read, grep, edit]` on an agent is a real dependency that
the compiler and the bundler can both see.

`write` and `edit` check the stage write policy. A read-only stage that somehow
receives them still cannot write. The policy is absent by default and an absent
policy is open, so a test must set it deliberately.

## Tests

`bunx vitest run plugins/core`
