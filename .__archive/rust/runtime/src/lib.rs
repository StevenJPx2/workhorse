// The sans-IO governor is pure and always compiled (kept for potential
// headless/wasm consumers).
pub mod workflow;
pub use workflow::{WorkflowError, WorkflowRun, WorkflowRunStep};

// The Harness + models drive rig's AgentRun over tokio — native only.
#[cfg(feature = "native")]
pub mod anthropic_direct;
#[cfg(feature = "native")]
pub mod genai_model;
#[cfg(feature = "native")]
pub mod harness;
#[cfg(feature = "native")]
pub mod mock_model;
#[cfg(feature = "native")]
pub mod model;
#[cfg(feature = "native")]
pub mod oauth;
#[cfg(feature = "native")]
pub mod orchestrator;
#[cfg(feature = "native")]
pub mod persist;
#[cfg(feature = "native")]
pub mod step;
#[cfg(feature = "native")]
pub mod subagent;

#[cfg(feature = "native")]
pub use genai_model::{GenAiClient, GenAiModel, GenAiResponse, GenAiStreamChunk};
#[cfg(feature = "native")]
pub use harness::{Harness, HarnessConfig, HarnessError, HarnessEvent, no_epilogue};
#[cfg(feature = "native")]
pub use mock_model::{
    MockClient, MockCompletionModel, MockModelConfig, MockResponse, MockToolCall,
};
#[cfg(feature = "native")]
pub use model::{
    ANTHROPIC_DEFAULT_MODEL, DEFAULT_OPENCODE_MODEL, ModelError, OPENCODE_ZEN_BASE_URL,
    ResolvedProvider, anthropic_creds_from_env, anthropic_model, anthropic_model_from_creds,
    anthropic_model_from_oauth, openai_compat_model, opencode_creds_from_env,
    resolve_provider_from_env,
};
#[cfg(feature = "native")]
pub use oauth::{
    AuthorizationRequest, OAuthError, REQUIRED_BETAS, StoredTokens, USER_AGENT,
    anthropic_beta_header, authorize_url, exchange_code, has_stored_tokens, launch_login,
    load_access_token,
};
#[cfg(feature = "native")]
pub use orchestrator::{
    ContextReader, DEFAULT_MAX_STAGE_RUNS, DriveOptions, ExternalEvent, OrchestratorEvent, Outcome,
    resume_workflow, run_to_completion, run_with_limit, stage_routing_keys, validate_state_keys,
};
#[cfg(feature = "native")]
pub use persist::{RunStore, state_root};
#[cfg(feature = "native")]
pub use step::assemble_request;
#[cfg(feature = "native")]
pub use subagent::{PermissionError, SpawnArgs, resolve_permissions, spawn_subagent_tool};
