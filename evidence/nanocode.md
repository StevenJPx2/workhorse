# nanocode: what Workhorse takes from it

[nanocode](https://nanocode.xyz/) (`gakonst/nanocode`, Apache-2.0) is a Rust SDK that runs Codex and Claude agents behind one durable runtime, natively or as one WebAssembly module. Facts below come from its documentation (`https://nanocode.xyz/llms-full.txt`, read 2026-11-02). Its source was not read. **(inferred)** marks a claim not confirmed against that documentation.

## Where it sits

| Layer | nanocode | Fit |
|---|---|---|
| 3 · Harness | Codex and Claude agent loops, Code Mode, subagents with typed output contracts, steering a running turn | A complete, embeddable harness |
| 2 · Runtime | Journaled turns and tool receipts, request IDs, brain and hands over WebSocket, hosts for native, Cloudflare Durable Objects, Vercel and the browser | Overlaps the durable mailbox, the link between devices and the host contract |
| 1 · Trust | One shared bearer token for hands; credentials added by the host (`dispatch`, `HostTransport`); tool hooks on the Claude harness | No grants, sandbox, tool gateway or steering rules |

nanocode would sit above layer 1 as a consumer. It loads no JavaScript plugins, so tack has no surface in it; a host that embeds nanocode calls steering directly.

## Taken

| # | Idea | nanocode evidence | Lands in |
|---|---|---|---|
| 1 | **Three outcomes for an interrupted call.** A committed call replays its recorded output. A call that may have started reports *unknown outcome* and never runs again. A call that was never sent reports *not dispatched* | Durability guide ("Receipts", "Interrupted calls"); `Contracts.RemoteRefusalError` | Layer 2 mailbox; steering verdicts in layer 1 |
| 2 | **A caller-chosen request ID on every submission.** The same ID and payload returns the existing result; the same ID with a different payload is a conflict | `submit` returns `existing` or `conflict`; the X bot uses request ID `x:<post id>` so a twice-polled mention queues one turn | Layer 2 mailbox; the approval queue, so an answer sent from two devices applies once; tack's queued actions |
| 3 | **Credentials are added outside the agent, and redirects are refused.** | "The SDK sends no credentials"; `dispatch` and `HostTransport`; "A `3xx` response fails the request with `provider redirect rejected`" | Layer 1 broker. A followed redirect would send the request, with its added secret, to a host the grant does not name **(inferred reason)** |
| 4 | **Pinned upstream artifacts, checked by capture.** The Claude harness pins one Claude Code release's identity text and tool schemas, and a script compares fresh captures against them | "Upstream Harnesses" in *Why nanocode* | tack's capability table: capture each agent's hook payloads per version and diff them in the conformance suite |
| 5 | **Every library crate builds natively and for `wasm32-unknown-unknown`, with no Cargo features.** Native-only code sits behind crate boundaries and `target_family = "wasm"` gates | FAQ, "Which Cargo Features?" | Layer 1 reference crates, so grants and steering run unchanged on the workerd and Cloudflare hosts of layer 2 |
| 6 | **Limits stated as numbers, and errors that say whether a retry can succeed.** | `EventHub` capped at 128 events and 4 MiB; `SocketPolicy` frame size and timeout; a 20-second ping; `HostFailureError.permanent` | Every layer 1 protocol and `tack-hook`: a permanent error denies at once, a transient one may retry within the hook's budget |

## Open

- **Hands as the place a grant is enforced.** The brain calls models and keeps the session; tools run on hands. Under session-scoped grants, the brain needs only model access, and each hand runs that session's tools under the session's grant and sandbox. Revoking a hand stops its tools.
- **Tools found on demand.** MCP tools are found through `tool_search` and callable inside Code Mode (`McpToolExposure::DeferredAndCodeMode`). The tool gateway could offer the same two modes.

## Not taken

| What | Why |
|---|---|
| Its session, event and hand protocols | Workhorse uses ACP for sessions and MCP for tools |
| One token shared by every hand | Weaker than a grant per session |
| Reusing Claude Code's prompts and stored login | The capture technique (4) is useful; whether reusing a subscription login this way is permitted is unverified |
| nanocode as a dependency | Layer 1 comes first. It is git-only, from one author, and would need approval as a production dependency |
