# @workhorse/workflow

The workflow engine: `workflow()`, `agent()` session compilation, stage graph
discovery, and prompt assembly.

A workflow is code. There is no interpreter, no spec registry, and nothing loaded
at runtime.

## Exports

| Export | What it does |
|---|---|
| `workflow(spec)` | Defines a workflow. It returns a definition that can also report its own graph. |
| `discoverGraph(run, options)` | Derives the stage graph by running `run()` against stub outputs. |
| `stubFromSchema(schema, polarity)` | Synthesizes a stub output from a valibot schema. |
| `agentSession(agent, input)` | Compiles an agent into a session: persona, tool allowlist, write policy, output schema. |
| `assembleAgentPrompt` | Builds an agent prompt from task data, upstream artifacts, steers, notifications, and the completion contract. |
| `stageDir` | Builds the stable artifact directory for one agent round. |
| `upstreamDigest` | Bounds one completed agent's result for the next agent. |
| `renderMermaid`, `renderText` | Renders a discovered graph. |

## Graph discovery

`run(ctx)` is imperative TypeScript, so the graph is not declared anywhere. To
recover it, discovery runs `run()` with a context that records each `ctx.run(agent,
…)` call and returns a stub output instead of calling a model.

One pass would only reveal one branch, because `run()` routes on stage output.
Discovery therefore runs several passes with different stub polarities, so a
reviewer stage that returns `fail` and one that returns `pass` both expose their
edges.

Discovery is best-effort by design. A `run()` that throws on stub data says nothing
about its graph, and the edges recorded before the throw are still true.

A branch that routes on something no polarity varies stays invisible. The `coding`
workflow's therapist stage only appears once discovery seeds a revision `runId`.

## Notes

An agent declares plugin tools as imported factories. It declares engine tools such
as `run_code` in a typed `engineTools` list, because those tools need bridge props
that a plugin factory cannot access.

The runtime validates `submit_work` output against the same Valibot schema that
builds the completion contract. The model cannot advance with an invalid control
object.

Tool consolidation was tried and reverted. A live model eval showed 31 granular
tools beat 4 consolidated ones by 5 to 12 points of first-call accuracy. A tool's
name is its primary retrieval signal, and merging tools destroys it. The rejected
surface is pinned in `evals/fixtures/consolidated-tools/` so the finding stays
reproducible.

## Tests

`bunx vitest run packages/workflow`
