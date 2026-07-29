# @workhorse/sandbox

The per-ticket container, and Code Mode.

The container is hands. It holds the cloned repo and runs tool calls over RPC. It
never holds a model credential.

## Exports

| Export | What it does |
|---|---|
| `sandboxDriver(env, id)` | The exec and file surface every tool call goes through. |
| `prepareWorkspace` | Clones the repo, checks out the branch, and seeds scripts. |
| `checkoutTicketBranch`, `deliverBranch` | Branch handling before and after a run. |
| `restoreDepCache`, `saveDepCache`, `depCacheKey` | The R2 dependency cache, keyed by lockfile hash. |
| `injectAuth`, `injectBrowserConfig`, `injectImgupConfig`, `injectTicketContext` | Writes per-run config into the container. |
| `makeToolBridge(deps)` | Builds the `ToolBridge` entrypoint the platform constructs by name. |
| `runCode` | Code Mode: runs one agent-written program that chains tools. |

## Code Mode

An agent can write one TypeScript program that chains several tools, and Workhorse
runs it in a disposable dynamic worker with `globalOutbound: null`. The program
reaches tools only through a loopback entrypoint, and that entrypoint checks an
authentic `ctx.props.allow` list. A refused tool is rejected before assembly, not
during the run.

This turns ten sequential tool calls into one.

## Notes

`makeToolBridge` is a factory, not a class export. The platform constructs the
entrypoint by name, so no constructor argument can carry the plugin registry. The
factory closes over the dependencies instead.

The image builds from `worker/Dockerfile`. Headful Chrome runs under
Xvfb, because bot walls block headless browsers deterministically, not
probabilistically.

## Tests

`bunx vitest run packages/sandbox`
