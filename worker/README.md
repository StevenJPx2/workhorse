# @workhorse/worker

The composition root, the ticket spine, and the deployment boundary.

This is the only package that imports concrete plugins. Everything else depends on
`@workhorse/api` and receives what it needs.

## Files

| File | What it holds |
|---|---|
| `index.ts` | The fetch and scheduled handlers. It builds the server from the registry. |
| `registry.ts` | The plugin list. The one place a concrete plugin is named. |
| `core.ts` | The `Core` facade every plugin calls back through. |
| `intake.ts` | Binds the intake surface to the registry's attachment providers. |
| `ticket-workflow.ts` | The durable Workflow: dispatch, drive, park, deliver. |
| `workflow-run.ts` | The concrete workflow context that runs stages. |
| `flue-session.ts` | Stage session construction and the engine builtins. |
| `codemode.ts` | The `ToolBridge` export the platform constructs by name. |

## Deployment

```
bun run deploy   # wrangler deploy, from worker/
```

`wrangler.jsonc` holds every binding. `alchemy.run.ts` at the repository root is
infrastructure-as-code that is not the active path, and its blockers are documented
at the top of that file.

The container image builds from `sandbox/Dockerfile`.

## Notes

The worker went from 19 files to 8 when the packages moved out. Every import cycle
went with them. `registry.ts` and `core.ts` were one file, holding both the plugin
list and the `Core` facade, so every module it reached imported it back.

`migrations` in `wrangler.jsonc` declares `v1` as an empty applied step. An Alchemy
deploy cleared the recorded tag, after which wrangler tried to re-apply
`new_sqlite_classes` for a class that already had live objects, which Cloudflare
rejects.

`freshToken` only reads. An external custodian keeps the model token fresh.

## Tests

`bunx vitest run --project worker`
