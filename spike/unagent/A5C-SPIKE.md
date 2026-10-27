# a5c-ai adapters: closest prior art, tested

Spike, 2026-10-27. This file checks whether Workhorse should build on a5c-ai's agent adapters instead of building `@workhorse/agents`.

Everything ran in a temporary directory:

- Packages were installed with `--ignore-scripts`.
- `HOME` pointed at a scratch folder.
- No model calls were made.
- No real agent configuration was touched.

Versions:

- `@a5c-ai/hooks-adapter-{cli,core,codex,pi}` 6.0.0. This is `latest`; `staging` is `6.0.3-staging.f5f113c68e2c`.
- Codex 0.164.0 source at tag `rust-v0.164.0`.
- Pi 1.4.0.

## What a5c-ai ships

All of it is in [`a5c-ai/babysitter`](https://github.com/a5c-ai/babysitter), under `packages/adapters/`. The repository has 1,872 stars, an MIT license, and was last pushed on 2026-09-16. Download counts are from npm for the week to 2026-10-27.

| Package | Downloads | What it does | Equivalent in our plan |
| --- | --- | --- | --- |
| `@a5c-ai/extensions-adapter` | 4.1k | Compiles one `plugin.json` into 12 agents' plugin formats. Has `compile`, `validate` and `diff` | The emitter |
| `@a5c-ai/config-adapter` | 8.9k | Install, config, auth and detecting which agents are installed | The emitter |
| `@a5c-ai/hooks-adapter-*` | core 7.6k | A canonical event model with 43 phases. Agents come in two families, shell hooks and in-process. Has a per-agent capability profile, a handler registry for fan-out, and a merge engine | The harness adapter |
| `@a5c-ai/comm-adapter`, `@a5c-ai/launch-adapter` | 11k, 8.9k | Drive an agent from outside: `createClient().run({ agent, prompt })` | Out of scope for the base |
| `@a5c-ai/tools-adapter`, `@a5c-ai/policy-adapter`, `@a5c-ai/transport-adapter` | 5.1k, —, — | Tool registry and dispatch, signed policy decisions, a model proxy | None |

Its documented merge rules (`packages/adapters/hooks/docs/examples/multi-plugin-fanout.md`):

| Part of the result | Rule |
| --- | --- |
| Handler order | Sequential, by priority |
| `decision` | Most restrictive wins: `deny > ask > allow > continue > noop` |
| `additionalContext` | Concatenated |
| `toolMutation` | One writer only |
| `continueSession` | `false` wins |

`@a5c-ai/comm-adapter` has a second hook system, `HookDispatcher`, with different rules (`docs/adapters/reference/15-hooks.md`):

- `deny` short-circuits.
- `modify` beats `allow`.
- Rewritten inputs are shallow-merged.

## Results

### Codex, through the documented hook command

Command: `adapters-hooks invoke --adapter codex --handler-timeout-ms 1000 --handler <script>…`, fed one Codex `PreToolUse` payload on stdin.

| Handlers | a5c prints (exit 0 in every case) | What Codex 0.164.0 does with it |
| --- | --- | --- |
| allow | `{"decision":"allow","metadata":{…}}` | Fails to parse. The hook fails and the call goes ahead |
| allow, then deny | `{"decision":"deny","metadata":{…}}` (reason dropped) | **Fails to parse. The hook fails and the call goes ahead** |
| crash (exit 1) | `{"decision":"noop",…}` | The call goes ahead |
| 5 s handler, 1 s timeout | `{"decision":"noop",…}` | The call goes ahead |
| ask | `{"decision":"ask",…}` | Fails to parse. The call goes ahead |
| `additionalContext` and `followUpMessage` | `{"decision":"noop",…}` (both dropped) | Nothing is delivered |

Why the deny fails:

- Codex's `PreToolUse` output accepts three shapes:
  - `hookSpecificOutput.permissionDecision`;
  - a top-level `decision` of only `approve` or `block` (`PreToolUseDecisionWire`, `codex-rs/hooks/src/schema.rs:269-274`);
  - exit 2.
- Output is parsed strictly. `parse_json` uses `serde_json::from_value`, and its `.ok()?` turns any error into "no output" (`codex-rs/hooks/src/engine/output_parser.rs:345-357`).
- The Codex docs say a malformed response "can fail the hook without blocking the tool".
- a5c's `renderCodexOutput` copies a5c's `decision` through unchanged. It never writes `hookSpecificOutput`, `block` or exit 2 (`hooks-adapter-codex/dist/renderer.js:60-84`).

**A deny from a5c 6.0.0 does not block a tool call in Codex 0.164.0.** This conclusion comes from Codex's source and docs. I didn't confirm it with a live Codex turn, because that needs a model call.

`adapters-hooks doctor --adapter codex` reports:

- no `additionalContext`;
- Bash-only tool interception;
- no input rewriting.

The Codex hooks docs list all three as supported, so the profile is out of date.

### Pi, through the in-process engine

`createConfiguredEngine()` with no arguments is the documented call, and it throws `Cannot read properties of undefined (reading 'adapterName')`. The shipped type declaration requires `{ adapterName, sessionDir? }`.

| Handlers | Merged result | `renderPiOutput(…, "tool_call")` |
| --- | --- | --- |
| allow, then deny | `deny`, reason kept | `{"decision":"deny","reason":"blocked by test"}` |
| crash | `noop` | `{"reason":"boom"}`. The call goes ahead |
| 3 s handler, 500 ms timeout | `noop` after 502 ms | The call goes ahead |
| deny, then crash | `deny`, reasons joined | `{"decision":"deny","reason":"blocked by test; boom"}` |
| two handlers rewriting the input | The engine throws `Multiple handlers produced tool mutations…` | — |

Pi's `tool_call` handler expects `{ block: true, reason }`. The renderer returns `{ decision: "deny" }`, and the package ships no Pi extension, so the caller writes the glue.

### Acting on a session

A handler can only shape its own hook's result: `additionalContext`, `followUpMessage`, `setModel`, `continueSession`. The packages expose nothing for acting on a session between hooks, such as waking an idle session, compacting, or adding a message while the agent works. This conclusion comes from searching the shipped `.d.ts` and `.js` files.

## Verdict

| Question | Answer |
| --- | --- |
| Does the idea already exist? | Yes. a5c-ai covers the emitter, hook normalization with fan-out and merging, and driving agents |
| Merging | Matches our plan: most restrictive wins, contexts concatenated, one writer for rewrites |
| Failure | Fails open by default: a crash or timeout becomes `noop`. Our plan fails closed |
| Codex | A deny does not block in 6.0.0, and the capability profile is out of date |
| Pi | Its output shape isn't Pi's; the caller writes the extension |
| Acting on sessions | Not available |
| Packaging | Docs and shipped code disagree (`createConfiguredEngine`). `extensions-adapter` 6.0.0 shipped with no build output, according to its own README. The packages depend on a large catalog package (`@a5c-ai/atlas`) and live inside an orchestration product |

**Recommendation:** build `@workhorse/agents` and don't depend on a5c-ai. Reuse its canonical phase names and merge table as a reference, and report the Codex renderer bug upstream.

## Reproduce

```sh
S=$TMPDIR/a5c-spike; mkdir -p $S/h && cd $S && npm init -y >/dev/null
npm install --ignore-scripts @a5c-ai/hooks-adapter-{cli,core,codex,pi}@6.0.0
printf '#!/bin/bash\ncat >/dev/null\necho %s\n' "'{\"decision\":\"deny\",\"reason\":\"blocked by test\"}'" > h/deny.sh && chmod +x h/deny.sh
echo '{"session_id":"s-1","transcript_path":null,"cwd":"/tmp","hook_event_name":"PreToolUse","model":"gpt-6","turn_id":"t-1","permission_mode":"default","tool_name":"Bash","tool_use_id":"call-1","tool_input":{"command":"rm -rf build"}}' \
  | HOME=$S/home node node_modules/@a5c-ai/hooks-adapter-cli/dist/cli/main.js invoke --adapter codex --handler h/deny.sh:d
# → {"decision":"deny","metadata":{"AGENT_SESSION_ID":"s-1","AGENT_ADAPTER":"codex"}}
```
