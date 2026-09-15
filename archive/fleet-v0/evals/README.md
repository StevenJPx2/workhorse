# @workhorse/evals

Behavioral tests for the parts that only a real model exercises.

## Suites

| Suite | Question it answers |
|---|---|
| Workflow evals | Does a workflow reach the right terminal state for a given task? |
| Tool-choice eval | Does a real model pick the right tool from the shipped descriptions? |

## Running

```
bun run eval          # evalite over the workflow evals
bun run eval:tools    # the tool-choice eval — needs OPENCODE_API_KEY
```

Neither runs in CI. The tool-choice eval makes hundreds of live model calls.

## Notes

`fixtures/consolidated-tools/` holds a REJECTED tool surface: the 4-tool
consolidated design, pinned from git. It stays because the eval compares granular
against consolidated, and both sides must be real shipped code. An earlier run
synthesized the granular side by splitting the consolidated descriptions and
reported the opposite conclusion. That was a strawman.

The result: 31 granular tools beat 4 consolidated ones by 5 to 12 points of
first-call accuracy. Two runs disagreed on the magnitude, because temperature 0 is
not fully deterministic through a provider, so the honest claim is a range.

The eval gate asserts that a surface may not trail its predecessor by more than 3
points. A flat "above 80%" threshold passed a 12-point regression.
