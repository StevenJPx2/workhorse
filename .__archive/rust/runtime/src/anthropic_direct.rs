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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<ApiTool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
}

/// A tool definition in Anthropic's `tools` request field.
#[derive(Serialize)]
struct ApiTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

/// A message whose `content` is an array of typed blocks (`text`, `tool_use`,
/// `tool_result`) — required to carry tool calls/results through the API.
#[derive(Serialize)]
struct ApiMessage {
    role: String,
    content: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct ApiResponse {
    content: Vec<ApiContent>,
    usage: ApiUsage,
}

/// A response content block: `text`, or `tool_use` (a tool call from the model).
#[derive(Deserialize)]
struct ApiContent {
    #[serde(rename = "type")]
    content_type: String,
    #[serde(default)]
    text: Option<String>,
    // tool_use fields
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    input: Option<serde_json::Value>,
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
            tools: to_anthropic_tools(&request),
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

        let tools = to_anthropic_tools(&request);
        let mut api_req = serde_json::json!({
            "model": self.model,
            "max_tokens": max_tokens,
            "stream": true,
            "messages": messages,
        });
        api_req["system"] = serde_json::json!(system);
        if !tools.is_empty() {
            api_req["tools"] = serde_json::json!(tools);
        }
        if let Some(temp) = request.temperature {
            api_req["temperature"] = serde_json::json!(temp);
        }

        let body = send_with_retry(&self.client, &self.api_key, &api_req).await?;
        let body = String::from_utf8_lossy(&body);

        let items = parse_sse_stream(&body);

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

/// Parse Anthropic SSE stream lines into rig streaming choices. Accumulates
/// usage from `message_start`/`message_delta` events and emits it in the final
/// `FinalResponse` so the Harness can bill token usage.
fn parse_sse_stream(
    body: &str,
) -> Vec<Result<RawStreamingChoice<GenAiStreamChunk>, CompletionError>> {
    let mut items: Vec<Result<RawStreamingChoice<GenAiStreamChunk>, _>> = Vec::new();

    // Anthropic splits usage across two events (input on `message_start`, output
    // on `message_delta`), so it must be carried forward to the final chunk.
    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;

    // Tool-use blocks stream as: content_block_start (id + name) →
    // content_block_delta (input_json_delta, partial args) →
    // content_block_stop. Accumulate the active block's id/name/args here.
    let mut tool_id: Option<String> = None;
    let mut tool_name: Option<String> = None;
    let mut tool_args = String::new();

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
            "message_start" => {
                input_tokens = event
                    .get("message")
                    .and_then(|m| m.get("usage"))
                    .and_then(|u| u.get("input_tokens"))
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0);
            }
            "content_block_start" => {
                let block = event.get("content_block");
                if block.and_then(|b| b.get("type")).and_then(|t| t.as_str())
                    == Some("tool_use")
                {
                    tool_id = block
                        .and_then(|b| b.get("id"))
                        .and_then(|v| v.as_str())
                        .map(ToString::to_string);
                    tool_name = block
                        .and_then(|b| b.get("name"))
                        .and_then(|v| v.as_str())
                        .map(ToString::to_string);
                    tool_args.clear();
                }
            }
            "content_block_delta" => {
                let delta = event.get("delta");
                if let Some(text) = delta.and_then(|d| d.get("text")).and_then(|t| t.as_str()) {
                    items.push(Ok(RawStreamingChoice::Message(text.to_string())));
                } else if let Some(partial) = delta
                    .and_then(|d| d.get("partial_json"))
                    .and_then(|t| t.as_str())
                {
                    tool_args.push_str(partial);
                }
            }
            "content_block_stop" => {
                if let (Some(id), Some(name)) = (tool_id.take(), tool_name.take()) {
                    let args: serde_json::Value = serde_json::from_str(&tool_args)
                        .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                    items.push(Ok(RawStreamingChoice::ToolCall(
                        rig::streaming::RawStreamingToolCall::new(id, name, args),
                    )));
                    tool_args.clear();
                }
            }
            "message_delta" => {
                output_tokens = event
                    .get("usage")
                    .and_then(|u| u.get("output_tokens"))
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0);
            }
            "message_stop" => {
                items.push(Ok(RawStreamingChoice::FinalResponse(GenAiStreamChunk {
                    text: None,
                    input_tokens,
                    output_tokens,
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
            input_tokens,
            output_tokens,
        })));
    }

    items
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

/// Push a `{"type":"text","text":...}` block, skipping empty/whitespace-only text
/// (Anthropic 400s on empty text content blocks — e.g. an assistant turn whose
/// only text part is `""` alongside a tool call).
fn push_text_block(blocks: &mut Vec<serde_json::Value>, text: &str) {
    if !text.trim().is_empty() {
        blocks.push(serde_json::json!({"type": "text", "text": text}));
    }
}

/// Anthropic rejects empty `tool_result` content; a tool that returned nothing
/// still needs a non-empty block.
fn tool_result_text(text: String) -> String {
    if text.trim().is_empty() {
        "(no output)".to_string()
    } else {
        text
    }
}

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
                // Skip empty system blocks (Anthropic rejects empty text blocks).
                if !content.trim().is_empty() {
                    system.push(SystemBlock {
                        block_type: "text".into(),
                        text: content.clone(),
                    });
                }
            }
            Message::User { content } => {
                let mut blocks = Vec::new();
                for item in content.iter() {
                    match item {
                        rig::completion::message::UserContent::Text(t) => {
                            push_text_block(&mut blocks, &t.text);
                        }
                        rig::completion::message::UserContent::ToolResult(r) => {
                            // A tool result must reference the originating
                            // tool_use id so the model can correlate it.
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
                            blocks.push(serde_json::json!({
                                "type": "tool_result",
                                "tool_use_id": r.id,
                                "content": tool_result_text(text),
                            }));
                        }
                        _ => {}
                    }
                }
                if !blocks.is_empty() {
                    messages.push(ApiMessage {
                        role: "user".to_string(),
                        content: blocks,
                    });
                }
            }
            Message::Assistant { content, .. } => {
                let mut blocks = Vec::new();
                for item in content.iter() {
                    match item {
                        rig::completion::AssistantContent::Text(t) => {
                            push_text_block(&mut blocks, &t.text);
                        }
                        rig::completion::AssistantContent::ToolCall(call) => {
                            blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": call.id,
                                "name": call.function.name,
                                "input": call.function.arguments,
                            }));
                        }
                        _ => {}
                    }
                }
                if !blocks.is_empty() {
                    messages.push(ApiMessage {
                        role: "assistant".to_string(),
                        content: blocks,
                    });
                }
            }
        }
    }

    (system, messages)
}

/// Map rig tool definitions to Anthropic's `tools` request field. Anthropic
/// requires every `input_schema` to be a JSON Schema *object* (`"type":"object"`
/// with a `properties` map); zero-arg tools whose schema is a bare bool / missing
/// type are coerced to the empty object schema so the request validates.
fn to_anthropic_tools(req: &CompletionRequest) -> Vec<ApiTool> {
    req.tools
        .iter()
        .map(|t| ApiTool {
            name: t.name.clone(),
            description: t.description.clone(),
            input_schema: normalize_input_schema(&t.parameters),
        })
        .collect()
}

/// Ensure a tool input schema is an object schema Anthropic accepts.
fn normalize_input_schema(schema: &serde_json::Value) -> serde_json::Value {
    let empty = || serde_json::json!({"type": "object", "properties": {}});
    let serde_json::Value::Object(map) = schema else {
        return empty();
    };
    if map.get("type").and_then(|t| t.as_str()) != Some("object") {
        return empty();
    }
    let mut out = map.clone();
    out.entry("properties")
        .or_insert_with(|| serde_json::json!({}));
    serde_json::Value::Object(out)
}

// ── Response mapping ────────────────────────────────────────────────────────

fn to_rig_response(
    resp: &ApiResponse,
) -> Result<CompletionResponse<GenAiResponse>, CompletionError> {
    let mut text_parts = Vec::new();
    let mut assistant_items = Vec::new();
    for content in &resp.content {
        match content.content_type.as_str() {
            "text" => {
                if let Some(text) = &content.text {
                    text_parts.push(text.clone());
                    assistant_items.push(AssistantContent::text(text));
                }
            }
            "tool_use" => {
                if let (Some(id), Some(name)) = (&content.id, &content.name) {
                    let input = content.input.clone().unwrap_or(serde_json::Value::Null);
                    assistant_items.push(AssistantContent::tool_call(id, name, input));
                }
            }
            _ => {}
        }
    }

    let text = text_parts.join("\n");
    if assistant_items.is_empty() {
        assistant_items.push(AssistantContent::text(""));
    }
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

#[cfg(test)]
mod tests {
    use super::normalize_input_schema;
    use serde_json::json;

    #[test]
    fn non_object_schema_becomes_empty_object() {
        // A zero-arg tool's schema (schemars emits e.g. `true` or no type).
        assert_eq!(
            normalize_input_schema(&json!(true)),
            json!({"type": "object", "properties": {}})
        );
        assert_eq!(
            normalize_input_schema(&json!({"description": "x"})),
            json!({"type": "object", "properties": {}})
        );
    }

    #[test]
    fn object_schema_gains_properties_if_missing() {
        assert_eq!(
            normalize_input_schema(&json!({"type": "object"})),
            json!({"type": "object", "properties": {}})
        );
    }

    #[test]
    fn valid_object_schema_is_preserved() {
        let s = json!({"type": "object", "properties": {"content": {"type": "string"}}});
        assert_eq!(normalize_input_schema(&s), s);
    }

    #[test]
    fn empty_text_blocks_are_skipped() {
        // Anthropic 400s on empty text content blocks; a tool-call-only assistant
        // turn (empty text part) must not emit one.
        let mut blocks = Vec::new();
        super::push_text_block(&mut blocks, "");
        super::push_text_block(&mut blocks, "   ");
        assert!(blocks.is_empty(), "empty/whitespace text must be skipped");
        super::push_text_block(&mut blocks, "hello");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0], json!({"type": "text", "text": "hello"}));
    }

    #[test]
    fn empty_tool_result_gets_placeholder() {
        // Anthropic also rejects empty tool_result content.
        assert_eq!(super::tool_result_text(String::new()), "(no output)");
        assert_eq!(super::tool_result_text("  ".into()), "(no output)");
        assert_eq!(super::tool_result_text("ok".into()), "ok");
    }
}
