//! Direct Anthropic API client implementing rig's `CompletionModel`.
//!
//! Used for Pro/Max OAuth tokens which require `authorization: Bearer` headers
//! (not `x-api-key`). rig's native Anthropic client and genai's `RequestOverride`
//! both have issues with this auth style, so this module calls the Anthropic API
//! directly via reqwest.
//!
//! Sends the Claude Code identity (`User-Agent` + billing header + first system
//! block) so the request conforms to what Anthropic's OAuth gateway expects.
//! Handles transient rate limits (429) with bounded exponential backoff honoring
//! `Retry-After`.

use sha2::{Digest, Sha256};

use rig::OneOrMany;
use rig::completion::{
    AssistantContent, CompletionError, CompletionModel, CompletionRequest, CompletionResponse,
    Message,
};
use rig::streaming::{RawStreamingChoice, StreamingCompletionResponse as RigStreamingResponse};
use serde::{Deserialize, Serialize};

use crate::genai_model::{GenAiResponse, GenAiStreamChunk};

// ── Constants ───────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages?beta=true";
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// First system block — the identity the OAuth gateway expects from Claude Code.
const CLAUDE_CODE_IDENTITY: &str = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";

/// User-Agent sent with every `/v1/messages` request.
const CLAUDE_USER_AGENT: &str = "claude-cli/2.1.87 (external, cli)";

/// Billing header components (from upstream `cch.ts`).
const CCH_SALT: &str = "59cf53e54c78";
const CCH_POSITIONS: [usize; 3] = [4, 7, 20];
const CLAUDE_CODE_VERSION: &str = "2.1.87";
const CLAUDE_CODE_ENTRYPOINT: &str = "sdk-cli";

/// Max retry attempts for transient 429 responses (exponential backoff).
const MAX_RETRIES: u32 = 3;

// ── Model ───────────────────────────────────────────────────────────────────

/// A direct Anthropic API client with `authorization: Bearer` auth.
/// Implements rig's `CompletionModel` for use with `Harness<M>`.
#[derive(Clone)]
pub struct AnthropicDirectModel {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl AnthropicDirectModel {
    #[must_use]
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            client: reqwest::Client::new(),
        }
    }
}

// ── API types ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct SystemBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: String,
}

#[derive(Serialize)]
struct ApiRequest {
    model: String,
    max_tokens: u32,
    system: Vec<SystemBlock>,
    messages: Vec<ApiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
}

#[derive(Serialize)]
struct ApiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ApiResponse {
    content: Vec<ApiContent>,
    usage: ApiUsage,
}

#[derive(Deserialize)]
struct ApiContent {
    #[serde(rename = "type")]
    content_type: String,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Deserialize)]
struct ApiUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

// ── CompletionModel impl ────────────────────────────────────────────────────

impl CompletionModel for AnthropicDirectModel {
    type Response = GenAiResponse;
    type StreamingResponse = GenAiStreamChunk;
    type Client = ();

    fn make(_client: &(), model: impl Into<String>) -> Self {
        Self {
            api_key: String::new(), // must be set via `new()`
            model: model.into(),
            client: reqwest::Client::new(),
        }
    }

    async fn completion(
        &self,
        request: CompletionRequest,
    ) -> Result<CompletionResponse<GenAiResponse>, CompletionError> {
        let (system, messages) = to_anthropic_messages(&request);

        let max_tokens = request
            .max_tokens
            .and_then(|m| u32::try_from(m).ok())
            .unwrap_or(16384);

        let api_req = ApiRequest {
            model: self.model.clone(),
            max_tokens,
            system,
            messages,
            temperature: request.temperature,
        };

        let body = send_with_retry(&self.client, &self.api_key, &api_req).await?;

        let api_resp: ApiResponse = serde_json::from_slice(&body)
            .map_err(|e| CompletionError::ProviderError(e.to_string()))?;

        to_rig_response(&api_resp)
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<RigStreamingResponse<GenAiStreamChunk>, CompletionError> {
        let (system, messages) = to_anthropic_messages(&request);

        let max_tokens = request
            .max_tokens
            .and_then(|m| u32::try_from(m).ok())
            .unwrap_or(16384);

        let mut api_req = serde_json::json!({
            "model": self.model,
            "max_tokens": max_tokens,
            "stream": true,
            "messages": messages,
        });
        api_req["system"] = serde_json::json!(system);
        if let Some(temp) = request.temperature {
            api_req["temperature"] = serde_json::json!(temp);
        }

        let body = send_with_retry(&self.client, &self.api_key, &api_req).await?;
        let body = String::from_utf8_lossy(&body);

        let mut items: Vec<Result<RawStreamingChoice<GenAiStreamChunk>, _>> = Vec::new();

        for line in body.lines() {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                break;
            }
            let Ok(event) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match event_type {
                "content_block_delta" => {
                    if let Some(text) = event
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        items.push(Ok(RawStreamingChoice::Message(text.to_string())));
                    }
                }
                "message_stop" => {
                    items.push(Ok(RawStreamingChoice::FinalResponse(GenAiStreamChunk {
                        text: None,
                    })));
                }
                _ => {}
            }
        }

        // If no events were parsed (unexpected format), yield empty final.
        if items.is_empty()
            || !items
                .iter()
                .any(|i| matches!(i, Ok(RawStreamingChoice::FinalResponse(_))))
        {
            items.push(Ok(RawStreamingChoice::FinalResponse(GenAiStreamChunk {
                text: None,
            })));
        }

        let stream = futures::stream::iter(items);
        Ok(RigStreamingResponse::stream(Box::pin(stream)))
    }
}

// ── Request sending with retry ──────────────────────────────────────────────

/// POST `body` as JSON to the Anthropic `/v1/messages` endpoint with bounded
/// exponential backoff for transient 429 rate-limit responses. Honours the
/// `Retry-After` header when present (parsed as integer seconds).
async fn send_with_retry(
    client: &reqwest::Client,
    api_key: &str,
    body: &impl Serialize,
) -> Result<Vec<u8>, CompletionError> {
    let bearer = format!("Bearer {api_key}");
    let beta = crate::oauth::anthropic_beta_header(None);

    for attempt in 0..MAX_RETRIES {
        let resp = client
            .post(ANTHROPIC_API_URL)
            .header("authorization", &bearer)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("anthropic-beta", &beta)
            .header("content-type", "application/json")
            .header("user-agent", CLAUDE_USER_AGENT)
            .json(body)
            .send()
            .await
            .map_err(|e| CompletionError::ProviderError(e.to_string()))?;

        let status = resp.status().as_u16();

        if resp.status().is_success() {
            return resp
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| CompletionError::ProviderError(e.to_string()));
        }

        if status == 429 && attempt + 1 < MAX_RETRIES {
            let wait = parse_retry_after_secs(&resp).unwrap_or_else(|| {
                let exp = 2u64.saturating_pow(attempt);
                exp.min(30)
            });
            tokio::time::sleep(std::time::Duration::from_secs(wait)).await;
            continue;
        }

        let body = resp.text().await.unwrap_or_default();
        return Err(CompletionError::ProviderError(format!(
            "Anthropic API error {status}: {body}"
        )));
    }

    unreachable!("loop always returns");
}

/// Parse `Retry-After` as integer seconds. Returns `None` if absent or
/// not a plain integer (HTTP-date not supported to avoid extra deps).
fn parse_retry_after_secs(resp: &reqwest::Response) -> Option<u64> {
    let val = resp.headers().get("retry-after")?;
    val.to_str().ok()?.parse::<u64>().ok()
}

// ── Billing header (SHA-256 fingerprint) ────────────────────────────────────

/// First 5 hex chars of SHA-256(message).
fn compute_cch(message_text: &str) -> String {
    let hash = format!("{:x}", Sha256::digest(message_text.as_bytes()));
    hash[..5].to_string()
}

/// 3-char version suffix: `SHA-256(salt + sampled_chars + version)[..3]`.
fn compute_version_suffix(message_text: &str) -> String {
    let sampled: String = CCH_POSITIONS
        .iter()
        .map(|&i| message_text.as_bytes().get(i).copied().unwrap_or(b'0') as char)
        .collect();
    let hash = format!(
        "{:x}",
        Sha256::digest(format!("{CCH_SALT}{sampled}{CLAUDE_CODE_VERSION}").as_bytes())
    );
    hash[..3].to_string()
}

/// Extract text from the first user message's first text block.
fn extract_first_user_message_text(req: &CompletionRequest) -> String {
    req.chat_history
        .iter()
        .find_map(|msg| match msg {
            Message::User { content } => content.iter().find_map(|item| match item {
                rig::completion::message::UserContent::Text(t) => Some(t.text.clone()),
                _ => None,
            }),
            _ => None,
        })
        .unwrap_or_default()
}

/// Build the billing header value that the OAuth gateway expects in `system[0]`.
fn build_billing_header_value(req: &CompletionRequest) -> String {
    let text = extract_first_user_message_text(req);
    let suffix = compute_version_suffix(&text);
    let cch = compute_cch(&text);
    format!(
        "x-anthropic-billing-header: cc_version={CLAUDE_CODE_VERSION}.{suffix}; \
         cc_entrypoint={CLAUDE_CODE_ENTRYPOINT}; cch={cch};"
    )
}

// ── Message mapping ─────────────────────────────────────────────────────────

fn to_anthropic_messages(req: &CompletionRequest) -> (Vec<SystemBlock>, Vec<ApiMessage>) {
    let mut system = Vec::new();

    // billing header → system[0] (anti-spoofing fingerprint).
    system.push(SystemBlock {
        block_type: "text".into(),
        text: build_billing_header_value(req),
    });

    // Claude Code identity → system[1].
    system.push(SystemBlock {
        block_type: "text".into(),
        text: CLAUDE_CODE_IDENTITY.to_string(),
    });

    // Preamble + user-supplied System messages → remaining blocks.
    if let Some(preamble) = &req.preamble {
        system.push(SystemBlock {
            block_type: "text".into(),
            text: preamble.clone(),
        });
    }

    let mut messages = Vec::new();

    for msg in req.chat_history.iter() {
        match msg {
            Message::System { content } => {
                system.push(SystemBlock {
                    block_type: "text".into(),
                    text: content.clone(),
                });
            }
            Message::User { content } => {
                let mut text_parts = Vec::new();
                for item in content.iter() {
                    match item {
                        rig::completion::message::UserContent::Text(t) => {
                            text_parts.push(t.text.clone());
                        }
                        rig::completion::message::UserContent::ToolResult(r) => {
                            let text: String = r
                                .content
                                .iter()
                                .filter_map(|c| match c {
                                    rig::completion::message::ToolResultContent::Text(t) => {
                                        Some(t.text.clone())
                                    }
                                    rig::completion::message::ToolResultContent::Image(_) => None,
                                })
                                .collect::<Vec<_>>()
                                .join("\n");
                            text_parts.push(text);
                        }
                        _ => {}
                    }
                }
                if !text_parts.is_empty() {
                    messages.push(ApiMessage {
                        role: "user".to_string(),
                        content: text_parts.join("\n"),
                    });
                }
            }
            Message::Assistant { content, .. } => {
                let mut text_parts = Vec::new();
                for item in content.iter() {
                    match item {
                        rig::completion::AssistantContent::Text(t) => {
                            text_parts.push(t.text.clone());
                        }
                        rig::completion::AssistantContent::ToolCall(call) => {
                            text_parts.push(format!(
                                "[tool_call: {}({})]",
                                call.function.name,
                                serde_json::to_string(&call.function.arguments)
                                    .unwrap_or_else(|_| "{}".to_string())
                            ));
                        }
                        _ => {}
                    }
                }
                if !text_parts.is_empty() {
                    messages.push(ApiMessage {
                        role: "assistant".to_string(),
                        content: text_parts.join("\n"),
                    });
                }
            }
        }
    }

    (system, messages)
}

// ── Response mapping ────────────────────────────────────────────────────────

fn to_rig_response(
    resp: &ApiResponse,
) -> Result<CompletionResponse<GenAiResponse>, CompletionError> {
    let mut text_parts = Vec::new();
    for content in &resp.content {
        if content.content_type == "text"
            && let Some(text) = &content.text
        {
            text_parts.push(text.clone());
        }
    }

    let text = text_parts.join("\n");
    let assistant_items = vec![AssistantContent::text(&text)];
    let choice = OneOrMany::many(assistant_items)
        .map_err(|e| CompletionError::ResponseError(e.to_string()))?;

    let input_tokens = resp.usage.input_tokens.unwrap_or(0);
    let output_tokens = resp.usage.output_tokens.unwrap_or(0);

    Ok(CompletionResponse {
        choice,
        usage: rig::completion::Usage {
            input_tokens,
            output_tokens,
            total_tokens: input_tokens + output_tokens,
            ..rig::completion::Usage::new()
        },
        raw_response: GenAiResponse {
            text: Some(text),
            input_tokens,
            output_tokens,
        },
        message_id: None,
    })
}
