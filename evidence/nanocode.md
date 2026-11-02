# nanocode: what Workhorse takes from it

[nanocode](https://nanocode.xyz/) (`gakonst/nanocode`, Apache-2.0, git-only with no releases) is a Rust SDK that runs Codex and Claude agents behind one durable runtime, natively or as one WebAssembly module. Facts below come from its documentation (`https://nanocode.xyz/llms-full.txt`, read 2026-11-02, when `master` was at `80b2d5a39b41`). Its source was not read. **(inferred)** marks a claim not confirmed against that documentation.

## Where it sits

| Layer | nanocode | Fit |
|---|---|---|
| 3 · Harness | Codex and Claude agent loops, Code Mode, subagents with typed output contracts, `turn.steer()` (adds user input to a running turn; unrelated to Workhorse's steering rules) | A complete, embeddable harness |
| 2 · Runtime | Journaled turns and tool receipts, request IDs, brain and hands over WebSocket, hosts for native, Cloudflare Durable Objects, Vercel and the browser | Overlaps the durable mailbox, the link between devices and the host contract |
| 1 · Trust | One shared bearer token for hands; host-owned request paths; tool hooks on the Claude backend | No grants, sandbox, tool gateway or steering rules |

nanocode sits above layer 1 as a consumer. Its documented interception points are where layer 1 attaches: "an HTTP layer around every model request, a host transport for Codex, and a payment provider for MCP tool calls".

| Layer 1 protocol | Attaches at |
|---|---|
| Broker | The HTTP layer, `HostTransport`, or `dispatch` in the WebAssembly host |
| Tool gateway | nanocode's MCP server list, pointed at the gateway |
| Sandbox | Around each hand |
| Steering | `ClaudeBuilder` tool hooks (Claude backend only), or at the hand, which covers both backends |

nanocode loads no JavaScript plugins, so tack has no surface in it.

## Taken

| # | Idea | nanocode evidence | Lands in |
|---|---|---|---|
| 1 | **Three outcomes for an interrupted call.** A committed call replays its recorded output. A call that may have started reports *unknown outcome* and never runs again. A call that was never sent reports *not dispatched* | Durability guide ("Receipts", "Interrupted calls"); `Contracts.RemoteRefusalError` | Layer 2 mailbox. In layer 1, the broker and the tool gateway: a request in flight when either restarts reports *unknown outcome* and is never sent again |
| 2 | **A caller-chosen request ID.** The same ID and payload returns the existing result; the same ID with a different payload is a conflict | Optional in nanocode. TypeScript `submit` returns `accepted`, `existing`, `conflict` or `too_large`; in Rust a repeat resumes the turn or returns its recorded result. The X bot uses `x:<post id>` so a twice-polled mention queues one turn | Required on approvals, so an answer sent from two devices applies once. Also the layer 2 mailbox and tack's queued actions |
| 3 | **Credentials are added outside the agent.** | The WebAssembly SDK "sends no credentials"; the host adds them in `dispatch`. In Rust, `HostTransport` with `OpenAiAuth::gateway_managed()` injects them ("the client sends no token"). Native Rust clients otherwise sign their own requests from a stored login | Layer 1 broker. A native client gets a placeholder key and the broker adds the real one |
| 4 | **Redirects are never followed blindly.** | Model requests fail on `3xx` ("provider redirect rejected") | Layer 1 broker: it never follows a redirect itself. It returns the `3xx` to the agent, and the follow-up request is checked against the grant like any other. A followed redirect would carry an added secret to a host the grant does not name **(inferred reason)** |
| 5 | **Pinned upstream artifacts, checked by capture.** The Claude harness pins one Claude Code release's identity text and tool schemas, and a script compares fresh captures against them | "Upstream Harnesses" in *Why nanocode* | tack's capability table: capture each agent's hook payloads per version and diff them in the conformance suite |
| 6 | **Pure crates build natively and for `wasm32-unknown-unknown`.** Native-only code sits behind crate boundaries and `target_family = "wasm"` gates | FAQ, "Which Cargo Features?" | The pure layer 1 crates (grant evaluation, steering rules, approval state), so they run unchanged on layer 2's workerd and Cloudflare hosts. Sandbox and broker stay native behind crate boundaries |
| 7 | **Limits set explicitly, and errors that say whether a retry can succeed.** | `EventHub` bounded by a host-set event count and byte size (the docs measure 128 events and 4 MiB); `SocketPolicy` frame size and a 40-second default request timeout; a 20-second ping; `HostFailureError.permanent` | Every layer 1 protocol and `tack-hook`: a permanent error denies at once; a transient one may retry within the hook's budget and denies when the budget runs out |
| 8 | **A remote call never falls back silently.** A call to a disconnected hand fails without running anything and never moves to another machine | Remote Hands, "Failure Rules" | The broker and the tool gateway: an unreachable destination fails the call; nothing reroutes it |

## Open

- **A hand per session.** In nanocode a hand serves a whole brain, the model picks a hand per call, and hand tools run alongside the brain's local tools unless `--runner-mode replace` is set. Under session-scoped grants, a hand would serve exactly one session, in replace mode, under that session's grant and sandbox. A file-grant change then revokes the hand and attaches a new one under the new grant: restart and resume at the hand only, while the session and its brain keep running.
- **Tools found on demand.** MCP tools are found through `tool_search` and callable inside Code Mode (`McpToolExposure::DeferredAndCodeMode`). The tool gateway could offer the same two modes.
- **No build features.** nanocode adds no Cargo features by policy. Adopting that rule for Workhorse's crates is proposed, not decided.

## Not taken

| What | Why |
|---|---|
| Its session, event and hand protocols | Workhorse uses ACP for sessions and MCP for tools |
| One token shared by every hand | Weaker than a grant per session |
| Reusing Claude Code's prompts and stored login | The capture technique (5) is useful; whether reusing a subscription login this way is permitted is unverified |
| nanocode as a dependency | Layer 1 comes first. It is git-only, from one author, and would need approval as a production dependency |
