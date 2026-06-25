use std::sync::Arc;

use pipeline::compiler::StepConfig;
use rig::completion::CompletionModel as _;
use rig::tool::ToolSet;
use runtime::{
    Harness, HarnessConfig, HarnessEvent, MockClient, MockCompletionModel, MockResponse,
    MockToolCall,
};
use serde_json::json;

fn mock_model(responses: Vec<MockResponse>) -> MockCompletionModel {
    MockCompletionModel::make(&MockClient::new(responses), "mock-model")
}

/// Returns the model plus a retained client clone; `received` is shared via Arc,
/// so the clone observes whatever messages the model is sent.
fn mock_model_with_client(responses: Vec<MockResponse>) -> (MockCompletionModel, MockClient) {
    let client = MockClient::new(responses);
    let model = MockCompletionModel::make(&client, "mock-model");
    (model, client)
}

fn empty_toolset() -> ToolSet {
    ToolSet::builder().build()
}

#[tokio::test]
async fn harness_drives_simple_completion() {
    let model = mock_model(vec![MockResponse {
        content: "hello world".into(),
        tool_calls: vec![],
    }]);

    let harness = Harness::new(model, empty_toolset(), HarnessConfig::default());
    let events = harness.run("say hello").await.unwrap();

    assert!(
        matches!(events.last(), Some(HarnessEvent::Done { output, .. }) if output == "hello world")
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, HarnessEvent::ModelCall { turn: 1 }))
    );
}

#[tokio::test]
async fn harness_sends_prologue_epilogue_and_handoff() {
    let (model, client) = mock_model_with_client(vec![MockResponse {
        content: "acknowledged".into(),
        tool_calls: vec![],
    }]);

    let step = StepConfig {
        prologue: Some("You are a planner.".into()),
        epilogue: Some("Output the plan.".into()),
        ..Default::default()
    };

    let harness = Harness::new(model, empty_toolset(), HarnessConfig::default());
    let (tx, _rx) = std::sync::mpsc::channel();
    harness
        .run_step(
            &step,
            "Break down the issue.",
            Some("handoff from verifier"),
            &runtime::no_epilogue,
            &tx,
        )
        .await
        .unwrap();

    let seen = client.received_text();
    assert!(
        seen.contains("You are a planner."),
        "prologue missing: {seen}"
    );
    assert!(
        seen.contains("Output the plan."),
        "epilogue missing: {seen}"
    );
    assert!(
        seen.contains("handoff from verifier"),
        "handoff missing: {seen}"
    );
    assert!(
        seen.contains("Break down the issue."),
        "task missing: {seen}"
    );
}

#[tokio::test]
async fn harness_drives_tool_round_trip() {
    let model = mock_model(vec![
        MockResponse {
            content: "let me check".into(),
            tool_calls: vec![MockToolCall {
                id: "tc-1".into(),
                name: "echo".into(),
                arguments: json!({"msg": "test"}),
            }],
        },
        MockResponse {
            content: "done".into(),
            tool_calls: vec![],
        },
    ]);

    let mut toolset = ToolSet::builder().build();
    toolset.add_tool(tools::RigToolBridge::new(
        tools::define_tool("echo", "Echo back", |args: EchoArgs, _ctx| async move {
            Ok(tools::ToolResult::ok(args.msg))
        })
        .build(),
        Arc::new(tools::ToolContext::new("/tmp")),
    ));

    let harness = Harness::new(model, toolset, HarnessConfig::default());
    let events = harness.run("use echo").await.unwrap();

    assert!(
        events
            .iter()
            .any(|e| matches!(e, HarnessEvent::ToolCall { name, .. } if name == "echo"))
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e, HarnessEvent::ToolResult { name, .. } if name == "echo"))
    );
    assert!(matches!(events.last(), Some(HarnessEvent::Done { output, .. }) if output == "done"));
}

#[tokio::test]
async fn harness_enforces_max_turns() {
    let model = mock_model(vec![MockResponse {
        content: "keep going".into(),
        tool_calls: vec![MockToolCall {
            id: "tc-1".into(),
            name: "loop".into(),
            arguments: json!({}),
        }],
    }]);

    let mut toolset = ToolSet::builder().build();
    toolset.add_tool(tools::RigToolBridge::new(
        tools::define_tool("loop", "Loops", |_args: (), _ctx| async move {
            Ok(tools::ToolResult::ok("looped"))
        })
        .build(),
        Arc::new(tools::ToolContext::new("/tmp")),
    ));

    let config = HarnessConfig {
        max_turns: 2,
        ..Default::default()
    };

    let harness = Harness::new(model, toolset, config);
    let result = harness.run("loop forever").await;

    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        runtime::HarnessError::AgentRun(_)
    ));
}

#[tokio::test]
async fn harness_cancels_at_boundary() {
    let model = mock_model(vec![MockResponse {
        content: "working".into(),
        tool_calls: vec![],
    }]);

    let harness = Harness::new(model, empty_toolset(), HarnessConfig::default());
    let cancel = harness.cancel_token();

    cancel.cancel();

    let events = harness.run("say hi").await.unwrap();
    assert!(events.iter().any(|e| matches!(e, HarnessEvent::Cancelled)));
}

#[tokio::test]
async fn harness_truncates_tool_output() {
    let long_output = "x".repeat(10_000);

    let model = mock_model(vec![
        MockResponse {
            content: "calling".into(),
            tool_calls: vec![MockToolCall {
                id: "tc-1".into(),
                name: "big".into(),
                arguments: json!({}),
            }],
        },
        MockResponse {
            content: "got it".into(),
            tool_calls: vec![],
        },
    ]);

    let mut toolset = ToolSet::builder().build();
    let output = long_output.clone();
    toolset.add_tool(tools::RigToolBridge::new(
        tools::define_tool("big", "Big output", move |_args: (), _ctx| {
            let o = output.clone();
            async move { Ok(tools::ToolResult::ok(o)) }
        })
        .build(),
        Arc::new(tools::ToolContext::new("/tmp")),
    ));

    let config = HarnessConfig {
        tool_output_limit: 100,
        ..Default::default()
    };

    let harness = Harness::new(model, toolset, config);
    let events = harness.run("call big").await.unwrap();

    let truncate_event = events.iter().find(|e| {
        matches!(
            e,
            HarnessEvent::ToolResult {
                truncated: true,
                ..
            }
        )
    });
    assert!(truncate_event.is_some());

    if let Some(HarnessEvent::ToolResult {
        result, truncated, ..
    }) = truncate_event
    {
        assert!(result.len() <= 100);
        assert!(*truncated);
    }
}

#[derive(schemars::JsonSchema, serde::Deserialize)]
struct EchoArgs {
    msg: String,
}

/// Real model call against Anthropic (native Claude API). Opt-in: ignored by
/// default and skipped silently unless `ANTHROPIC_API_KEY` is set. Run with:
/// `cargo test -p runtime -- --ignored real_anthropic_completion`.
#[tokio::test]
#[ignore = "hits the network; needs ANTHROPIC_API_KEY"]
async fn real_anthropic_completion() {
    let Some((api_key, model, base_url)) = runtime::anthropic_creds_from_env() else {
        eprintln!("skipped: ANTHROPIC_API_KEY not set");
        return;
    };
    let model =
        runtime::anthropic_model(&api_key, &model, base_url.as_deref()).expect("build model");
    let harness = Harness::new(model, empty_toolset(), HarnessConfig::default());

    let events = harness
        .run("Reply with the single word: ok")
        .await
        .expect("real completion");

    assert!(
        matches!(events.last(), Some(HarnessEvent::Done { .. })),
        "expected a Done event, got: {events:?}"
    );
}

/// Real model call against opencode zen (free `mimo-v2.5`). Opt-in: ignored by
/// default and skipped silently unless `OPENCODE_API_KEY` is set. Run with:
/// `cargo test -p runtime -- --ignored real_opencode_zen_completion`.
#[tokio::test]
#[ignore = "hits the network; needs OPENCODE_API_KEY"]
async fn real_opencode_zen_completion() {
    let Some((base, key, model_id)) = runtime::opencode_creds_from_env() else {
        eprintln!("skipped: OPENCODE_API_KEY not set");
        return;
    };
    let model = runtime::openai_compat_model(&base, &key, &model_id).expect("build model");
    let harness = Harness::new(model, empty_toolset(), HarnessConfig::default());

    let events = harness
        .run("Reply with the single word: ok")
        .await
        .expect("real completion");

    assert!(
        matches!(events.last(), Some(HarnessEvent::Done { .. })),
        "expected a Done event, got: {events:?}"
    );
}
