use std::sync::Arc;
use std::sync::Mutex;

use rig::OneOrMany;
use rig::completion::{
    CompletionModel, CompletionRequest, CompletionResponse, GetTokenUsage, Usage,
};
use rig::message::AssistantContent;
use rig::streaming::{RawStreamingChoice, StreamingCompletionResponse};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockResponse {
    pub content: String,
    pub tool_calls: Vec<MockToolCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockStreamingChunk {
    pub content: String,
}

impl GetTokenUsage for MockStreamingChunk {
    fn token_usage(&self) -> Usage {
        Usage::new()
    }
}

#[derive(Clone)]
pub struct MockCompletionModel {
    client: Arc<MockClient>,
    model_id: String,
}

#[derive(Clone)]
pub struct MockClient {
    pub scripted_responses: Arc<Mutex<Vec<MockResponse>>>,
    pub call_count: Arc<Mutex<usize>>,
    pub received: Arc<Mutex<Vec<rig::completion::Message>>>,
}

#[derive(Debug, Clone, Default)]
pub struct MockModelConfig {
    pub responses: Vec<MockResponse>,
}

impl MockClient {
    #[must_use]
    pub fn new(responses: Vec<MockResponse>) -> Self {
        Self {
            scripted_responses: Arc::new(Mutex::new(responses)),
            call_count: Arc::new(Mutex::new(0)),
            received: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Number of completion calls made so far.
    ///
    /// # Panics
    /// Panics if the internal mutex is poisoned.
    #[must_use]
    pub fn call_count(&self) -> usize {
        *self.call_count.lock().unwrap()
    }

    /// The concatenated JSON of every message the model received.
    ///
    /// # Panics
    /// Panics if the internal mutex is poisoned.
    #[must_use]
    pub fn received_text(&self) -> String {
        self.received
            .lock()
            .unwrap()
            .iter()
            .filter_map(|m| serde_json::to_string(m).ok())
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn next_response(&self) -> MockResponse {
        let mut count = self.call_count.lock().unwrap();
        let responses = self.scripted_responses.lock().unwrap();
        let idx = *count % responses.len();
        *count += 1;
        responses[idx].clone()
    }
}

impl CompletionModel for MockCompletionModel {
    type Response = MockResponse;
    type StreamingResponse = MockStreamingChunk;
    type Client = MockClient;

    fn make(client: &Self::Client, model: impl Into<String>) -> Self {
        Self {
            client: Arc::new((*client).clone()),
            model_id: model.into(),
        }
    }

    async fn completion(
        &self,
        request: CompletionRequest,
    ) -> Result<CompletionResponse<Self::Response>, rig::completion::CompletionError> {
        self.client
            .received
            .lock()
            .unwrap()
            .extend(request.chat_history);
        let response = self.client.next_response();
        let model_id = self.model_id.clone();

        let content: OneOrMany<AssistantContent> = if response.tool_calls.is_empty() {
            OneOrMany::one(AssistantContent::text(response.content.clone()))
        } else {
            let mut items: Vec<AssistantContent> =
                vec![AssistantContent::text(response.content.clone())];
            for tc in &response.tool_calls {
                items.push(AssistantContent::tool_call(
                    tc.id.clone(),
                    tc.name.clone(),
                    tc.arguments.clone(),
                ));
            }
            OneOrMany::many(items)
                .map_err(|e| rig::completion::CompletionError::ResponseError(e.to_string()))?
        };

        Ok(CompletionResponse {
            choice: content,
            usage: Usage::new(),
            raw_response: response,
            message_id: Some(format!("mock-{model_id}-{}", self.client.call_count())),
        })
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<
        StreamingCompletionResponse<Self::StreamingResponse>,
        rig::completion::CompletionError,
    > {
        // Record the same way `completion` does.
        self.client
            .received
            .lock()
            .unwrap()
            .extend(request.chat_history);
        let response = self.client.next_response();
        let model_id = self.model_id.clone();
        let call_count = self.client.call_count();

        // Yield text as a single Message chunk, then tool calls, then FinalResponse.
        let mut items: Vec<Result<RawStreamingChoice<MockStreamingChunk>, _>> = Vec::new();
        items.push(Ok(RawStreamingChoice::Message(response.content.clone())));
        for tc in &response.tool_calls {
            items.push(Ok(RawStreamingChoice::ToolCall(
                rig::streaming::RawStreamingToolCall::new(
                    tc.id.clone(),
                    tc.name.clone(),
                    tc.arguments.clone(),
                ),
            )));
        }
        items.push(Ok(RawStreamingChoice::FinalResponse(MockStreamingChunk {
            content: response.content.clone(),
        })));
        items.push(Ok(RawStreamingChoice::MessageId(format!(
            "mock-{model_id}-{call_count}"
        ))));

        let stream = futures::stream::iter(items);
        Ok(StreamingCompletionResponse::stream(Box::pin(stream)))
    }
}
