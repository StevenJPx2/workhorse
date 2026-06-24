# Real model

A real rig `CompletionModel` droppable into the Harness in place of `MockCompletionModel`.

```rust
let model = runtime::openai_compat_model(base_url, &api_key, "mimo-v2.5")?;
let harness = Harness::new(model, toolset, cfg);   // same Harness, real model
```

**Key simplification (validated):** the first real target — opencode zen "go"
(`https://opencode.ai/zen/go/v1`, free `mimo-v2.5`) — is **OpenAI chat-completions compatible**, so
rig's own openai provider *is* the shim. No genai crate, no request/response mapping code: build
rig's `CompletionsClient` with a custom `base_url` + api key and call `.completion_model(id)`. genai
only becomes worth adding for a provider rig can't host (subscription/native-protocol auth); deferred
until one shows up.

Steps are **idempotent**: each names an end-state contract plus its test. Verify with
`cargo test -p runtime`; the live call runs only under `--ignored` with `OPENCODE_API_KEY` set.

## Steps

- [x] **1 — Harness generic over the model** (`runtime/src/harness.rs`)
  `Harness<M: CompletionModel>` replaced the hardcoded `MockCompletionModel` field. Existing tests
  pass unchanged — the mock satisfies the bound. This is the seam that lets any model drop in.

- [x] **2 — Real model builder** (`runtime/src/model.rs`)
  `openai_compat_model(base_url, api_key, model) -> rig openai `CompletionModel`` via
  `CompletionsClient::builder().api_key(..).base_url(..).build()?.completion_model(id)`.
  `opencode_creds_from_env()` reads `OPENCODE_API_KEY` (+ optional `OPENCODE_BASE_URL`/`OPENCODE_MODEL`,
  defaulting to opencode zen + `mimo-v2.5`); absent key → `None` so callers fall back to the mock.
  Native-only (`#[cfg(feature = "native")]`).

- [x] **3 — Opt-in live call + demo toggle**
  `runtime/tests/harness_test.rs::real_opencode_zen_completion` is `#[ignore]` + skips without a key;
  run it with `cargo test -p runtime -- --ignored real_opencode_zen_completion`. The `wh-demo` Harness
  panel has a **Mock / Real** toggle (Real disabled until the key is set), and `--selfcheck` adds a
  real check that runs only when the key is present (mock is always the offline default).

- [x] **4 — Anthropic provider (native Claude API)**
  `runtime/src/model.rs` now has `anthropic_model(api_key, model, base_url?)` via rig's native
  Anthropic provider (`ClientBuilder`). `anthropic_creds_from_env()` reads `ANTHROPIC_API_KEY` (+
  optional `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`); absent key → `None`. This is the primary
  auth path for `opencode-anthropic-auth` plugin users (the plugin manages OAuth; the Rust side
  reads the key it injects via env vars). `resolve_provider_from_env()` tries Anthropic first,
  then `OpenAI`-compatible, else Mock. An `#[ignore]` test
  (`real_anthropic_completion`) makes the live call on demand.

- [x] **5 — genai shim (25+ providers)**
  `runtime/src/genai_model.rs` implements rig's `CompletionModel` for genai's `Client`.
  `GenAiModel::new(client, model)` with `GenAiClient::default_client()` (reads provider env vars)
  or `GenAiClient::with_auth_resolver(resolver)` (custom OAuth). Maps rig messages → genai
  `ChatRequest`, tool definitions → genai `Tool`, and response `ContentPart` back to rig
  `AssistantContent`. Streaming returns an error (not yet wired). Supports all 25+ genai providers:
  `claude-sonnet-4-6`, `gpt-5.4-mini`, `gemini-3-flash-preview`, `groq::openai/gpt-oss-20b`,
  `opencode_go::mimo-v2.5`, etc. `genai = "0.7.0-beta.5"` added as optional dep behind `native`.

## Providers

| Provider | Auth | Default model | Notes |
|---|---|---|---|
| Anthropic (API key) | `ANTHROPIC_API_KEY` env var | `claude-sonnet-4-6` | Direct API key. |
| Anthropic (OAuth) | `cargo run -p wh-demo -- --auth` | `claude-sonnet-4-6` | PKCE flow via `claude.ai`. Tokens stored at `~/.config/workhorse/anthropic-tokens.json`. Auto-refreshes. |
| genai (25+ providers) | `GenAiClient::default_client()` | — | Any model genai supports: `claude-sonnet-4-6`, `gpt-5.4-mini`, `gemini-3-flash-preview`, `groq::openai/gpt-oss-20b`, `opencode_go::mimo-v2.5`, etc. Auth via provider env vars. |
| genai (OAuth) | `GenAiClient::with_auth_resolver(resolver)` | — | Custom `AuthResolver` for OAuth tokens (e.g. the stored Anthropic OAuth token). |
| OpenAI-compat | `OPENCODE_API_KEY` env var | `mimo-v2.5` @ opencode zen | Free tier / gateways. |
| Mock | (none) | — | Offline default. Always safe for CI. |

The mock stays the default everywhere offline; the real paths are strictly opt-in via env creds, so
CI and the default demo never touch the network.
