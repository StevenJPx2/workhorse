//! Anthropic OAuth (PKCE) — ported from `@ex-machina/opencode-anthropic-auth`.
//!
//! Provides the Claude Pro/Max subscription auth flow: PKCE authorization →
//! code exchange → token storage → automatic refresh. Tokens are persisted at
//! `~/.config/workhorse/anthropic-tokens.json` so login is a one-time step.
//!
//! # Flow
//! 1. Call [`authorize_url`] to get the browser URL + PKCE verifier.
//! 2. Open the URL (browser launches automatically via [`launch_login`]).
//! 3. User pastes the authorization code from the callback page.
//! 4. Call [`exchange_code`] to get access + refresh tokens.
//! 5. Call [`load_access_token`] later — it refreshes automatically if expired.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::Digest;

// ── Constants (from the plugin) ─────────────────────────────────────────────

/// Anthropic OAuth client id (shared with the opencode-anthropic-auth plugin).
const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/// Authorization endpoint for Claude Pro/Max (subscription).
const AUTHORIZE_URL_MAX: &str = "https://claude.ai/oauth/authorize";
/// Authorization endpoint for console (API key creation).
const AUTHORIZE_URL_CONSOLE: &str = "https://platform.claude.com/oauth/authorize";

/// Token exchange / refresh endpoint.
const TOKEN_URL: &str = "https://platform.claude.com/v1/oauth/token";

/// Redirect URI — Anthropic's hosted callback page that shows the code.
const REDIRECT_URI: &str = "https://platform.claude.com/oauth/code/callback";

/// OAuth scopes required for Claude Code / agent usage.
const SCOPES: &[&str] = &[
    "org:create_api_key",
    "user:profile",
    "user:inference",
    "user:sessions:claude_code",
    "user:mcp_servers",
    "user:file_upload",
];

/// Beta flags required for OAuth-authenticated requests.
pub const REQUIRED_BETAS: &[&str] = &["oauth-2025-04-20", "interleaved-thinking-2025-05-14"];

// ── Shared HTTP client ──────────────────────────────────────────────────────

/// Process-wide `reqwest::Client` reused across token exchange/refresh calls so
/// the connection pool and TLS config are built once, not per request.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

/// User-Agent sent with API requests (matches Claude Code CLI).
pub const USER_AGENT: &str = "claude-cli/2.1.87 (external, cli)";

// ── Errors ──────────────────────────────────────────────────────────────────

/// Errors from the OAuth flow.
#[derive(Debug, thiserror::Error)]
pub enum OAuthError {
    #[error("token exchange failed: {status} — {body}")]
    ExchangeFailed { status: u16, body: String },
    #[error("token refresh failed: {status} — {body}")]
    RefreshFailed { status: u16, body: String },
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("no stored tokens — run `workhorse auth` first")]
    NoTokens,
    #[error("invalid authorization code format")]
    InvalidCode,
}

// ── Token storage ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix timestamp (seconds) when the access token expires.
    pub expires_at: u64,
}

/// Path to the token store file.
fn token_store_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("workhorse");
    config_dir.join("anthropic-tokens.json")
}

fn save_tokens(tokens: &StoredTokens) -> Result<(), OAuthError> {
    let path = token_store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(tokens)?;
    std::fs::write(&path, json)?;
    Ok(())
}

fn load_stored_tokens() -> Result<StoredTokens, OAuthError> {
    let path = token_store_path();
    let json = std::fs::read_to_string(&path).map_err(|_| OAuthError::NoTokens)?;
    let tokens: StoredTokens = serde_json::from_str(&json)?;
    Ok(tokens)
}

// ── PKCE ────────────────────────────────────────────────────────────────────

struct PkceChallenge {
    verifier: String,
    challenge: String,
}

/// Generate a PKCE S256 challenge pair (verifier + challenge).
fn generate_pkce() -> PkceChallenge {
    let mut rng = rand::thread_rng();
    let verifier_bytes: Vec<u8> = (0..64).map(|_| rng.r#gen()).collect();
    let verifier = base64url_no_pad(&verifier_bytes);

    let digest = sha2::Sha256::digest(verifier.as_bytes());
    let challenge = base64url_no_pad(&digest);

    PkceChallenge {
        verifier,
        challenge,
    }
}

fn base64url_no_pad(data: &[u8]) -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    URL_SAFE_NO_PAD.encode(data)
}

/// Generate a random state string (UUID-like, no hyphens).
fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.r#gen()).collect();
    base64url_no_pad(&bytes)
}

// ── Authorization ───────────────────────────────────────────────────────────

/// The result of building an authorization URL — holds the PKCE verifier
/// needed later for the code exchange.
pub struct AuthorizationRequest {
    /// The URL to open in the browser.
    pub url: String,
    /// PKCE verifier — must be passed to [`exchange_code`].
    pub verifier: String,
    /// Random state — must be verified in the callback.
    pub state: String,
}

/// Build the authorization URL for the given mode ("max" for Pro/Max, "console"
/// for API key creation). Returns the URL and the PKCE verifier/state needed
/// for the exchange.
///
/// # Panics
/// Panics if the hardcoded authorize URL constants fail to parse (infallible
/// for well-formed URLs).
#[must_use]
pub fn authorize_url(mode: &str) -> AuthorizationRequest {
    let pkce = generate_pkce();
    let state = generate_state();

    let base = if mode == "console" {
        AUTHORIZE_URL_CONSOLE
    } else {
        AUTHORIZE_URL_MAX
    };

    let mut url = url::Url::parse(base).expect("valid authorize URL");
    url.query_pairs_mut()
        .append_pair("code", "true")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("scope", &SCOPES.join(" "))
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state);

    AuthorizationRequest {
        url: url.to_string(),
        verifier: pkce.verifier,
        state,
    }
}

/// Launch the browser for the "max" (Pro/Max) login flow and return the
/// authorization request (verifier + state needed for exchange).
///
/// # Errors
/// Returns [`OAuthError::Io`] if the browser cannot be opened.
pub fn launch_login() -> Result<AuthorizationRequest, OAuthError> {
    let req = authorize_url("max");
    open::that(&req.url)?;
    Ok(req)
}

// ── Code exchange ───────────────────────────────────────────────────────────

/// Parse an authorization code from user input. Accepts:
/// - A full callback URL (`https://…?code=…&state=…`)
/// - A `code#state` fragment pair (Anthropic's clipboard format)
/// - URL-encoded params (`code=…&state=…`)
/// - Just the raw code string
fn parse_auth_code(input: &str) -> Result<(String, Option<String>), OAuthError> {
    let trimmed = input.trim();

    // Try parsing as a URL with query params.
    if let Ok(url) = url::Url::parse(trimmed) {
        let code = url
            .query_pairs()
            .find(|(k, _)| k == "code")
            .map(|(_, v)| v.to_string());
        let state = url
            .query_pairs()
            .find(|(k, _)| k == "state")
            .map(|(_, v)| v.to_string());
        if let Some(c) = code {
            return Ok((c, state));
        }
    }

    // Try fragment format: "code#state" (Anthropic clipboard copy).
    if let Some((left, right)) = trimmed.split_once('#')
        && !left.is_empty()
        && !right.is_empty()
    {
        return Ok((left.to_string(), Some(right.to_string())));
    }

    // Try URLSearchParams-style: "code=…&state=…"
    if trimmed.contains('=') {
        let pairs: std::collections::HashMap<String, String> =
            url::form_urlencoded::parse(trimmed.as_bytes())
                .into_owned()
                .collect();
        if let Some(code) = pairs.get("code") {
            return Ok((code.clone(), pairs.get("state").cloned()));
        }
    }

    // Try JSON: {"code": "...", "state": "..."}
    if trimmed.starts_with('{')
        && let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed)
        && let Some(code) = json["code"].as_str()
    {
        return Ok((code.to_string(), json["state"].as_str().map(String::from)));
    }

    // Assume raw code.
    if trimmed.is_empty() {
        return Err(OAuthError::InvalidCode);
    }
    Ok((trimmed.to_string(), None))
}

/// Exchange an authorization code for access + refresh tokens.
///
/// `input` is whatever the user pasted (full URL, fragment pair, or raw code).
/// `verifier` and `expected_state` come from the [`AuthorizationRequest`] returned by
/// [`authorize_url`] or [`launch_login`].
///
/// # Errors
/// Returns [`OAuthError::ExchangeFailed`] if the token endpoint rejects the
/// code, or [`OAuthError::InvalidCode`] if the input can't be parsed.
pub async fn exchange_code(
    input: &str,
    verifier: &str,
    expected_state: &str,
) -> Result<StoredTokens, OAuthError> {
    let (code, state) = parse_auth_code(input)?;

    // Trim any stray whitespace from the parsed code (clipboard artifacts).
    let code = code.trim().to_string();
    let state = state.map(|s| s.trim().to_string());

    if state.as_deref().is_some_and(|s| s != expected_state) {
        return Err(OAuthError::ExchangeFailed {
            status: 400,
            body: format!(
                "state mismatch — expected {expected_state:?}, got {:?}",
                state.as_deref().unwrap_or("(none)")
            ),
        });
    }

    let client = http_client();
    let resp = client
        .post(TOKEN_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .header("User-Agent", USER_AGENT)
        .json(&serde_json::json!({
            "code": code,
            "state": state.unwrap_or_default(),
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": verifier,
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(OAuthError::ExchangeFailed { status, body });
    }

    let json: serde_json::Value = resp.json().await?;
    let access_token = json["access_token"]
        .as_str()
        .ok_or_else(|| OAuthError::ExchangeFailed {
            status: 200,
            body: "missing access_token in response".to_string(),
        })?;
    let refresh_token =
        json["refresh_token"]
            .as_str()
            .ok_or_else(|| OAuthError::ExchangeFailed {
                status: 200,
                body: "missing refresh_token in response".to_string(),
            })?;
    let expires_in = json["expires_in"].as_u64().unwrap_or(3600);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    let tokens = StoredTokens {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        expires_at: now + expires_in,
    };

    save_tokens(&tokens)?;
    Ok(tokens)
}

// ── Token refresh ───────────────────────────────────────────────────────────

/// Refresh an expired access token using the stored refresh token.
///
/// # Errors
/// Returns [`OAuthError::RefreshFailed`] if the token endpoint rejects the
/// refresh token, or [`OAuthError::NoTokens`] if nothing is stored.
async fn refresh_tokens(stored: &StoredTokens) -> Result<StoredTokens, OAuthError> {
    let client = http_client();
    let resp = client
        .post(TOKEN_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .header("User-Agent", USER_AGENT)
        .json(&serde_json::json!({
            "grant_type": "refresh_token",
            "refresh_token": stored.refresh_token,
            "client_id": CLIENT_ID,
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(OAuthError::RefreshFailed { status, body });
    }

    let json: serde_json::Value = resp.json().await?;
    let access_token = json["access_token"]
        .as_str()
        .ok_or_else(|| OAuthError::RefreshFailed {
            status: 200,
            body: "missing access_token in refresh response".to_string(),
        })?;
    let refresh_token = json["refresh_token"]
        .as_str()
        .unwrap_or(&stored.refresh_token); // Some responses omit it if unchanged.
    let expires_in = json["expires_in"].as_u64().unwrap_or(3600);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    let tokens = StoredTokens {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        expires_at: now + expires_in,
    };

    save_tokens(&tokens)?;
    Ok(tokens)
}

// ── Public API ──────────────────────────────────────────────────────────────

/// Load a valid access token, refreshing automatically if expired.
///
/// Returns `Ok(token)` if a valid token is available (either fresh from disk
/// or refreshed). Returns `Err(NoTokens)` if no tokens are stored (user needs
/// to run the login flow first).
///
/// # Errors
/// Returns [`OAuthError`] if tokens are stored but refresh fails, or if no
/// tokens exist.
pub async fn load_access_token() -> Result<String, OAuthError> {
    let mut tokens = load_stored_tokens()?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    // Refresh with a 60-second buffer before actual expiry.
    if tokens.expires_at < now + 60 {
        tokens = refresh_tokens(&tokens).await?;
    }

    Ok(tokens.access_token)
}

/// Check whether stored tokens exist (login has been completed).
#[must_use]
pub fn has_stored_tokens() -> bool {
    token_store_path().exists()
}

/// Build the `anthropic-beta` header value, merging any existing betas.
#[must_use]
pub fn anthropic_beta_header(existing: Option<&str>) -> String {
    let mut betas: Vec<String> = REQUIRED_BETAS.iter().map(ToString::to_string).collect();
    if let Some(existing) = existing {
        for b in existing.split(',').map(str::trim) {
            if !b.is_empty() && !betas.iter().any(|x| x == b) {
                betas.push(b.to_string());
            }
        }
    }
    betas.join(",")
}
