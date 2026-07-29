# @workhorse/scripts

Agent self-extension: a saved program that a later run replays.

## Tools

| Tool | What it does |
|---|---|
| `list_scripts` | The inventory an agent chooses from. |
| `write_script` | Saves a composed pipeline for future runs. |

`run_script` is not here. Execution is an engine builtin in
`worker/src/flue-session.ts`. Replaying a saved Code Mode program needs the stage's
authentic bridge props, and a plugin tool context cannot reach them.

## Routes

`GET /scripts`, `POST /scripts`, and `GET /scripts/get?ticket=`.

## Registry

The D1 `scripts` table. A repo's `.workhorse/scripts.toml` seeds it during workspace
preparation.

## Notes

A script is a Code Mode program, so it chains the stage's tools in one sandboxed
run. Replay is deterministic where re-deriving the same pipeline is not.

A script can declare status gates. A gated script refuses to run when the ticket is
in the wrong state.

## Tests

`bunx vitest run plugins/scripts`
