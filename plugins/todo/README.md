# @workhorse/todo

The per-run todo list that carries a plan from the planner to the coder.

## Tools

| Tool | What it does |
|---|---|
| `todo_write` | Writes the full ordered list. |
| `todo_read` | Reads the list. |
| `todo_update` | Marks one item done or blocked. |

## Store

One JSON file per run, at `/workspace/.workflow/todos.json`. Not D1, and not KV: a
todo list belongs to one run's workspace and dies with it.

## Notes

`todo_write` and `todo_read` are separate tools because the stage allowlist gates by
tool name. It cannot express "this tool, but read-only". Merging them would let a
review stage mark items done. That misleads the next coder visit, because the coder
reads the same file to choose its next item.

The `plan` stage gets `todo_write`. The coder gets `todo_read` and `todo_update`.

`/workspace/.workflow/` is added to `.git/info/exclude`, so run artifacts stay out
of the diff and the PR without touching tracked files.

## Tests

`bunx vitest run plugins/todo`
