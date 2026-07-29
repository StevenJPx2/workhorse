# @workhorse/test-utils

The doubles and harnesses for all three test layers.

Subpath exports, not a barrel. A tool test should not pull in a model client.

## Layers

| Layer | Import | Proves |
|---|---|---|
| Mocked | `@workhorse/test-utils/tools` | The tool builds the call it intends to build. |
| Contract | (no import — real binaries) | The call the tool builds is one the real binary accepts. |
| Model eval | `@workhorse/test-utils/model` | A real model picks the right tool from the shipped descriptions. |

## /tools

| Export | What it does |
|---|---|
| `fakeSandbox` | An in-memory filesystem and scriptable exec. It records every command. |
| `fakeCore` | All Core methods with benign defaults. |
| `fakeEnv` | Worker bindings. An unstubbed binding throws and names itself. |
| `stubFetch` | Per-URL routing. An unrouted call fails loudly. |
| `fakeAiSearch` | An AI Search double with search and upload. |
| `runTool` | Runs a tool factory against a built context. |

## /workflow

`workflowHarness` scripts stage verdicts and records the call sequence, visit
counts, and loop-backs. It is structurally typed and does not import
`@workhorse/workflow`, so that package's own tests can use it without a cycle.

## /model

`runToolChoiceEval` derives model-facing JSON Schema from the real `ToolFactory`
definitions, so an eval cannot drift from what ships. It defaults to the
opencode-go endpoint, where a flat-rate subscription makes hundreds of scoring
calls free.

## Notes

Mocked tests prove only that a tool builds the string it meant to build. They
cannot prove the string is right. Six shipped browser bugs passed 84 mocked tests,
including a wrong CLI signature and an unwrapped response envelope. Contract tests
against the real binary found all six.

A double must match production. The tool context defaulted to `repo:
"acme/widgets"`, but `fileTicket` stores `https://github.com/acme/widgets.git`.
That one wrong field hid a broken API path in every `gh_*` tool, across 66 passing
tests.

`runTool` passes the write policy through, and omits it by default. The gate treats
an absent policy as open. A permissive default would make every test pass, whether
the tool checks the policy or not.
