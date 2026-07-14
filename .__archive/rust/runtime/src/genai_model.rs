//! genai shim — a rig `CompletionModel` backed by the genai multi-provider client.
//!
//! genai handles 25+ providers with native protocols (`Anthropic`, `OpenAI`, `Gemini`,
//! `Ollama`, `Groq`, `xAI`, `DeepSeek`, `Bedrock`, `Vertex`, …) plus `AuthResolver` for
//! custom auth (e.g. `OAuth` tokens). This shim maps rig's `CompletionRequest` →
//! genai `ChatRequest`, calls `exec_chat`, and maps the response back.
//!
//! Tool definitions are mapped; tool calls in responses are mapped back. Both the
//! non-streaming (`exec_chat`) and streaming (`exec_chat_stream`) paths are
//! implemented — `stream()` maps genai `ChatStreamEvent`s (text chunks, tool-call
//! chunks, and the usage-carrying end event) to rig `RawStreamingChoice`s. The
//! shim is generic over any provider genai supports — the model name selects the
//! adapter (e.g. `claude-sonnet-4-6` → `Anthropic`, `gpt-5.4-mini` → `OpenAI`,
//! `opencode_go::mimo-v2.5` → opencode zen).

use futures::StreamExt as _;
use genai::chat::{
    ChatMessage, ChatOptions, ChatRequest, ChatResponse, ChatStreamEvent, ContentPart,
    Tool as GenAiTool,
};
use genai::resolver::AuthResolver;
use rig::OneOrMany;
use rig::completion::message::{ToolResultContent, UserContent};
use rig::completion::{
    AssistantContent, CompletionError, CompletionModel, CompletionRequest, CompletionResponse,
    Message,
};
use rig::streaming::{RawStreamingChoice, StreamingCompletionResponse};
use serde::{Deserialize, Serialize};

// ── Public types ────────────────────────────────────────────────────────────

/// A rig `CompletionModel` backed by genai. Construct via [`GenAiModel::new`]
/// or the [`CompletionModel::make`] trait method (via [`GenAiClient`]).
#[derive(Clone)]
pub struct GenAiModel {
    client: genai::Client,
    model: String,
}

/// Wrapper around [`genai::Client`] satisfying rig's `CompletionModel::Client` type.
#[derive(Clone)]
pub struct GenAiClient {
    inner: genai::Client,
}

impl GenAiClient {
    /// Build a genai client with default auth (reads provider env vars).
    #[must_use]
    pub fn default_client() -> Self {
        Self {
            inner: genai::Client::default(),
        }
    }

    /// Build a genai client with a custom `AuthResolver` (e.g. for OAuth tokens).
    #[must_use]
    pub fn with_auth_resolver(resolver: AuthResolver) -> Self {
        Self {
            inner: genai::Client::builder()
                .with_auth_resolver(resolver)
                .build(),
        }
    }
}

impl GenAiModel {
    /// Create a new genai-backed model. `model` selects the provider adapter
    /// (e.g. `claude-sonnet-4-6`, `gpt-5.4-mini`, `opencode_go::mimo-v2.5`).
    #[must_use]
    pub fn new(client: genai::Client, model: impl Into<String>) -> Self {
        Self {
            client,
            model: model.into(),
        }
    }
}

// ── Response wrapper ────────────────────────────────────────────────────────

/// Serializable response wrapper satisfying rig's `CompletionModel::Response`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenAiResponse {
    pub text: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

/// The terminal streaming payload carried by `RawStreamingChoice::FinalResponse`.
/// Holds the captured token usage from genai's stream-end event so the Harness
/// can bill it.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GenAiStreamChunk {
    pub text: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

impl rig::completion::GetTokenUsage for GenAiStreamChunk {
    fn token_usage(&self) -> rig::completion::Usage {
        let mut usage = rig::completion::Usage::new();
        usage.input_tokens = self.input_tokens;
        usage.output_tokens = self.output_tokens;
        usage.total_tokens = self.input_tokens + self.output_tokens;
        usage
    }
}

// ── CompletionModel impl ────────────────────────────────────────────────────

impl CompletionModel for GenAiModel {
    type Response = GenAiResponse;
    type StreamingResponse = GenAiStreamChunk;
    type Client = GenAiClient;

    fn make(client: &GenAiClient, model: impl Into<String>) -> Self {
        Self::new(client.inner.clone(), model)
    }

    async fn completion(
        &self,
        request: CompletionRequest,
    ) -> Result<CompletionResponse<GenAiResponse>, CompletionError> {
        let chat_req = to_genai_request(&request);
        let mut options = ChatOptions::default();
        if let Some(temp) = request.temperature {
            options = options.with_temperature(temp);
        }
        if let Some(max) = request.max_tokens {
            options = options.with_max_tokens(u32::try_from(max).unwrap_or(u32::MAX));
        }

        let response = self
            .client
            .exec_chat(&self.model, chat_req, Some(&options))
            .await
            .map_err(|e| CompletionError::ProviderError(e.to_string()))?;

        to_rig_response(&response)
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse<GenAiStreamChunk>, CompletionError> {
        let chat_req = to_genai_request(&request);
        // Capture usage so the stream-end event carries token counts the Harness
        // can bill.
        let mut options = ChatOptions::default().with_capture_usage(true);
        if let Some(temp) = request.temperature {
            options = options.with_temperature(temp);
        }
        if let Some(max) = request.max_tokens {
            options = options.with_max_tokens(u32::try_from(max).unwrap_or(u32::MAX));
        }

        let response = self
            .client
            .exec_chat_stream(&self.model, chat_req, Some(&options))
            .await
            .map_err(|e| CompletionError::ProviderError(e.to_string()))?;

        // Map genai stream events → rig streaming choices lazily.
        let mapped = response.stream.filter_map(|event| async move {
            match event {
                Ok(ChatStreamEvent::Chunk(c)) => Some(Ok(RawStreamingChoice::Message(c.content))),
                Ok(ChatStreamEvent::ToolCallChunk(tc)) => Some(Ok(RawStreamingChoice::ToolCall(
                    rig::streaming::RawStreamingToolCall::new(
                        tc.tool_call.call_id,
                        tc.tool_call.fn_name,
                        tc.tool_call.fn_arguments,
                    ),
                ))),
                Ok(ChatStreamEvent::End(end)) => {
                    let usage = end.captured_usage.unwrap_or_default();
                    Some(Ok(RawStreamingChoice::FinalResponse(GenAiStreamChunk {
                        text: None,
                        input_tokens: u64::try_from(usage.prompt_tokens.unwrap_or(0)).unwrap_or(0),
                        output_tokens: u64::try_from(usage.completion_tokens.unwrap_or(0))
                            .unwrap_or(0),
                    })))
                }
                // Start / reasoning / thought-signature events carry nothing the
                // Harness consumes.
                Ok(_) => None,
                Err(e) => Some(Err(CompletionError::ProviderError(e.to_string()))),
            }
        });

        Ok(StreamingCompletionResponse::stream(Box::pin(mapped)))
    }
}

// ── Message mapping: rig → genai ────────────────────────────────────────────

fn to_genai_request(req: &CompletionRequest) -> ChatRequest {
    let mut messages = Vec::new();

    // System preamble.
    if let Some(preamble) = &req.preamble {
        messages.push(ChatMessage::system(preamble));
    }

    // Chat history.
    for msg in req.chat_history.iter() {
        match msg {
            Message::System { content } => {
                messages.push(ChatMessage::system(content));
            }
            Message::User { content } => {
                for item in content.iter() {
                    match item {
                        UserContent::Text(text) => {
                            messages.push(ChatMessage::user(&text.text));
                        }
                        UserContent::ToolResult(result) => {
                            let text = result
                                .content
                                .iter()
                                .filter_map(|c| match c {
                                    ToolResultContent::Text(t) => Some(t.text.as_str()),
                                    ToolResultContent::Image(_) => None,
                                })
                                .collect::<Vec<_>>()
                                .join("\n");
                            messages.push(ChatMessage::tool(text));
                        }
                        _ => {
                            // Image/audio/video/document — not mapped.
                        }
                    }
                }
            }
            Message::Assistant { content, .. } => {
                for item in content.iter() {
                    match item {
                        AssistantContent::Text(text) => {
                            messages.push(ChatMessage::assistant(&text.text));
                        }
                        AssistantContent::ToolCall(call) => {
                            // Serialize the tool call as context text until full
                            // tool-call round-trip is wired.
                            let text = format!(
                                "[tool_call: {}({})]",
                                call.function.name,
                                serde_json::to_string(&call.function.arguments)
                                    .unwrap_or_else(|_| "{}".to_string())
                            );
                            messages.push(ChatMessage::assistant(text));
                        }
                        _ => {
                            // Reasoning/image — not mapped.
                        }
                    }
                }
            }
        }
    }

    let mut chat_req = ChatRequest::new(messages);

    // Tool definitions.
    if !req.tools.is_empty() {
        let tools: Vec<GenAiTool> = req
            .tools
            .iter()
            .map(|t| {
                GenAiTool::new(t.name.clone())
                    .with_description(t.description.clone())
                    .with_schema(t.parameters.clone())
            })
            .collect();
        chat_req = chat_req.with_tools(tools);
    }

    chat_req
}

// ── Response mapping: genai → rig ───────────────────────────────────────────

fn to_rig_response(
    response: &ChatResponse,
) -> Result<CompletionResponse<GenAiResponse>, CompletionError> {
    let text = response.first_text().unwrap_or("").to_string();

    // Extract tool calls from the response content.
    let mut assistant_items = Vec::new();
    for part in &response.content {
        if let ContentPart::ToolCall(tc) = part {
            assistant_items.push(AssistantContent::tool_call(
                tc.call_id.clone(),
                tc.fn_name.clone(),
                tc.fn_arguments.clone(),
            ));
        }
    }

    // Always include the text content (before tool calls if both present).
    if !text.is_empty() {
        assistant_items.insert(0, AssistantContent::text(text));
    }

    if assistant_items.is_empty() {
        assistant_items.push(AssistantContent::text(""));
    }

    let choice = OneOrMany::many(assistant_items)
        .map_err(|e| CompletionError::ResponseError(e.to_string()))?;

    // Usage from genai.
    let usage = &response.usage;
    let input_tokens = u64::from(usage.prompt_tokens.unwrap_or(0).unsigned_abs());
    let output_tokens = u64::from(usage.completion_tokens.unwrap_or(0).unsigned_abs());

    Ok(CompletionResponse {
        choice,
        usage: rig::completion::Usage {
            input_tokens,
            output_tokens,
            total_tokens: input_tokens + output_tokens,
            ..rig::completion::Usage::new()
        },
        raw_response: GenAiResponse {
            text: response.first_text().map(String::from),
            input_tokens,
            output_tokens,
        },
        message_id: None,
    })
}
