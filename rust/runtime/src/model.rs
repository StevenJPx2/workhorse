//! Real model builders — one per auth provider, all returning a rig
//! `CompletionModel` droppable into `Harness<M>`. Native-only (needs rig
//! providers + reqwest).
//!
//! Providers tried (first key wins):
//!   1. **Anthropic** (`ANTHROPIC_API_KEY`) — native Claude API. Also used by
//!      the `opencode-anthropic-auth` plugin (`@ex-machina/opencode-anthropic-auth`).
//!   2. **`OpenAI`-compatible** (`OPENCODE_API_KEY`) — opencode zen go, a gateway,
//!      or any `OpenAI` chat-completions endpoint.
//!   3. **Mock** (neither key set) — the offline default.

use rig::client::CompletionClient as _;

// ── OpenAI-compatible (opencode zen, gateways) ──────────────────────────────

use rig::providers::openai::{CompletionModel as OpenAIModel, CompletionsClient};

/// Default opencode zen "go" endpoint (free tier). `OpenAI` chat-completions shape.
pub const OPENCODE_ZEN_BASE_URL: &str = "https://opencode.ai/zen/go/v1";

/// A sensible free opencode-zen model id for smoke tests.
pub const DEFAULT_OPENCODE_MODEL: &str = "mimo-v2.5";

/// Build a real rig `CompletionModel` over an `OpenAI` chat-completions endpoint.
///
/// `base_url` is the API root (e.g. [`OPENCODE_ZEN_BASE_URL`]); `api_key` is the
/// bearer token; `model` is the provider model id (e.g. [`DEFAULT_OPENCODE_MODEL`]).
///
/// # Errors
/// Returns [`ModelError::Client`] if the underlying HTTP client cannot be built.
pub fn openai_compat_model(
    base_url: &str,
    api_key: &str,
    model: &str,
) -> Result<OpenAIModel, ModelError> {
    let client = CompletionsClient::builder()
        .api_key(api_key)
        .base_url(base_url)
        .build()
        .map_err(|e| ModelError::Client(e.to_string()))?;
    Ok(client.completion_model(model))
}

/// Read `OpenAI`-compatible (opencode zen) credentials from the environment.
///
/// Returns `Some((base_url, api_key, model))` only when `OPENCODE_API_KEY` is set;
/// `OPENCODE_BASE_URL` and `OPENCODE_MODEL` fall back to the opencode-zen defaults.
/// Absent key → `None`, so callers transparently fall through to another provider.
#[must_use]
pub fn opencode_creds_from_env() -> Option<(String, String, String)> {
    let api_key = std::env::var("OPENCODE_API_KEY").ok()?;
    let base_url =
        std::env::var("OPENCODE_BASE_URL").unwrap_or_else(|_| OPENCODE_ZEN_BASE_URL.to_string());
    let model =
        std::env::var("OPENCODE_MODEL").unwrap_or_else(|_| DEFAULT_OPENCODE_MODEL.to_string());
    Some((base_url, api_key, model))
}

// ── Anthropic (native Claude API) ───────────────────────────────────────────

use rig::providers::anthropic::completion::CompletionModel as AnthropicCompletionModel;

/// Default model id for Anthropic calls.
pub const ANTHROPIC_DEFAULT_MODEL: &str = "claude-sonnet-4-6";

/// Build a rig `CompletionModel` for the native Anthropic API.
///
/// `api_key` is the Anthropic API key (or an OAuth bearer from the
/// `opencode-anthropic-auth` plugin); `model` is the model id (e.g.
/// [`ANTHROPIC_DEFAULT_MODEL`]); `base_url` overrides the default endpoint
/// (useful for proxied setups, or when the plugin injects
/// `ANTHROPIC_BASE_URL`).
///
/// # Errors
/// Returns [`ModelError::Client`] if the HTTP client cannot be built.
pub fn anthropic_model(
    api_key: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<AnthropicCompletionModel<reqwest::Client>, ModelError> {
    let mut builder = rig::providers::anthropic::Client::builder().api_key(api_key);
    if let Some(url) = base_url {
        builder = builder.base_url(url);
    }
    let client = builder
        .build()
        .map_err(|e| ModelError::Client(e.to_string()))?;
    Ok(client.completion_model(model))
}

/// Build an Anthropic model, resolving the API key from env or OAuth tokens.
///
/// If `api_key` is `"oauth"` (the sentinel from [`anthropic_creds_from_env`]),
/// loads the real access token via [`crate::oauth::load_access_token`] (async,
/// handles refresh). Otherwise uses `api_key` directly.
///
/// # Errors
/// Returns [`ModelError`] if the token cannot be loaded or the client cannot
/// be built.
pub async fn anthropic_model_from_creds(
    api_key: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<AnthropicCompletionModel<reqwest::Client>, ModelError> {
    let resolved_key = if api_key == "oauth" {
        crate::oauth::load_access_token()
            .await
            .map_err(|e| ModelError::Client(format!("OAuth token load failed: {e}")))?
    } else {
        api_key.to_string()
    };
    anthropic_model(&resolved_key, model, base_url)
}

/// Build an Anthropic model for OAuth tokens via a direct API client.
///
/// Pro/Max OAuth tokens require `authorization: Bearer` headers (not `x-api-key`).
/// This module calls the Anthropic API directly via reqwest with the correct headers.
///
/// `model` is the model id (e.g. [`ANTHROPIC_DEFAULT_MODEL`]).
///
/// # Errors
/// Returns [`ModelError`] if the token cannot be loaded.
pub async fn anthropic_model_from_oauth(
    model: &str,
) -> Result<crate::anthropic_direct::AnthropicDirectModel, ModelError> {
    let access_token = crate::oauth::load_access_token()
        .await
        .map_err(|e| ModelError::Client(format!("OAuth token load failed: {e}")))?;

    Ok(crate::anthropic_direct::AnthropicDirectModel::new(
        access_token,
        model,
    ))
}

/// Read Anthropic credentials from the environment or stored OAuth tokens.
///
/// Resolution order:
/// 1. `ANTHROPIC_API_KEY` env var (direct API key — highest priority).
/// 2. Stored OAuth tokens from the login flow (`~/.config/workhorse/anthropic-tokens.json`).
///    The stored access token is returned as the "api key"; the model builder uses it directly.
///    Note: if the stored token is expired, [`load_access_token`] handles refresh — this
///    function only checks for the token *file* existence (sync check).
///
/// `ANTHROPIC_MODEL` and `ANTHROPIC_BASE_URL` are optional overrides.
/// Absent both key and stored tokens → `None`.
#[must_use]
pub fn anthropic_creds_from_env() -> Option<(String, String, Option<String>)> {
    let model =
        std::env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| ANTHROPIC_DEFAULT_MODEL.to_string());
    let base_url = std::env::var("ANTHROPIC_BASE_URL").ok();

    // 1. Stored OAuth tokens take precedence (Pro/Max subscription).
    //    The actual access token is loaded lazily (and refreshed if needed)
    //    via `oauth::load_access_token()` when building the model. For the
    //    creds-from-env check, we just need to know tokens exist.
    if crate::oauth::has_stored_tokens() {
        // Return a sentinel — the caller must call `oauth::load_access_token()`
        // for the actual token. Using "oauth" as a marker that the model builder
        // recognizes and replaces with the real token.
        return Some(("oauth".to_string(), model, base_url));
    }

    // 2. Direct API key (secondary fallback).
    if let Ok(api_key) = std::env::var("ANTHROPIC_API_KEY")
        && !api_key.is_empty()
    {
        return Some((api_key, model, base_url));
    }

    None
}

// ── Provider resolution ─────────────────────────────────────────────────────

/// The provider resolved from the environment for opt-in real calls.
/// Try Anthropic first, then `OpenAI`-compatible, else Mock.
pub enum ResolvedProvider {
    Anthropic {
        api_key: String,
        model: String,
        base_url: Option<String>,
    },
    OpenAICompat {
        base_url: String,
        api_key: String,
        model: String,
    },
    Mock,
}

/// Resolve the best available provider from env vars (first key wins).
/// Anthropic takes precedence — the typical case for workhorse (Claude).
#[must_use]
pub fn resolve_provider_from_env() -> ResolvedProvider {
    if let Some((api_key, model, base_url)) = anthropic_creds_from_env() {
        return ResolvedProvider::Anthropic {
            api_key,
            model,
            base_url,
        };
    }
    if let Some((base_url, api_key, model)) = opencode_creds_from_env() {
        return ResolvedProvider::OpenAICompat {
            base_url,
            api_key,
            model,
        };
    }
    ResolvedProvider::Mock
}

// ── Errors ──────────────────────────────────────────────────────────────────

/// Error building the real model (e.g. transport construction failed).
#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("failed to build model client: {0}")]
    Client(String),
}
