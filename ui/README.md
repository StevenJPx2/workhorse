# workhorse-ui

The Nuxt front end for the fleet.

## Pages

| Page | What it shows |
|---|---|
| `index.vue` | Chat-first home. File a ticket by describing it. |
| `tickets/` | The fleet list, and a run-centric ticket page with live output. |
| `workflows/` | The stage graph, read-only. |
| `agents.vue` | The agent block registry, editable. |
| `embed.vue` | A compact view for dashboards. |

## Running

```
bun run dev     # from ui/
```

The UI talks to the worker over HTTP and holds no fleet state of its own.

## Notes

The workflow pages are read-only on purpose. A workflow is hard-coded TypeScript,
so there is nothing to edit here. The old visual editor went with the interpreter.

Agent blocks and scripts remain editable, because both are registry data.

An operator edit marks a block `source: "user"`, and re-seeding then skips it. That
is right for a deliberate edit, and it also means a rename shipped in the image
never reaches an edited block.
