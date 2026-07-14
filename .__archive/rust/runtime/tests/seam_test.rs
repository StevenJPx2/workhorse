//! End-to-end seam: a fired exit's epilogue rides from `WorkflowRun` into the
//! Harness's first request for the next stage, via `assemble_request`.

use std::collections::HashMap;

use pipeline::compile_stage;
use pipeline::compiler::{ExitRule, StageConfig, StepConfig, WorkflowConfig};
use rig::completion::CompletionModel as _;
use runtime::{
    Harness, HarnessConfig, MockClient, MockCompletionModel, MockResponse, WorkflowRun,
    WorkflowRunStep,
};
use serde_json::json;

#[tokio::test]
async fn workflow_handoff_reaches_the_model_request() {
    // stage_a --paused(epilogue)--> stage_b ; stage_b parks on `approved`.
    let config = WorkflowConfig {
        name: "seam".into(),
        version: "1".into(),
        initial: "stage_a".into(),
        states: indexmap::IndexMap::from([
            (
                "stage_a".to_string(),
                StageConfig {
                    exits: vec![ExitRule {
                        when: "builtin::paused".into(),
                        to: "stage_b".into(),
                        epilogue: Some("implementation finished; verify against goals".into()),
                    }],
                    ..Default::default()
                },
            ),
            (
                "stage_b".to_string(),
                StageConfig {
                    step: StepConfig {
                        prologue: Some("You are the verifier.".into()),
                        epilogue: Some("Report pass or fail.".into()),
                        ..Default::default()
                    },
                    exits: vec![ExitRule {
                        when: "approved".into(),
                        to: "done".into(),
                        epilogue: None,
                    }],
                },
            ),
        ]),
        presets: std::collections::HashMap::new(),
    };
    let program = compile_stage(&config).unwrap();

    let mut run = WorkflowRun::new("stage_a", 100_000).with_state({
        let mut s = HashMap::new();
        s.insert("approved".into(), json!(false));
        s
    });

    // Advance the workflow to the stage_b entry, capturing its handoff.
    let _ = run.next_step(&program).unwrap(); // RunStage stage_a (no handoff)
    run.stage_complete(&program, HashMap::new(), 10).unwrap();

    let (stage, handoff) = match run.next_step(&program).unwrap() {
        WorkflowRunStep::RunStage { stage, handoff } => (stage, handoff),
        other => panic!("expected RunStage, got {other:?}"),
    };
    assert_eq!(stage, "stage_b");

    // Drive stage_b's step through the Harness with that handoff.
    let client = MockClient::new(vec![MockResponse {
        content: "fail: one check did not pass".into(),
        tool_calls: vec![],
    }]);
    let model = MockCompletionModel::make(&client, "mock-model");
    let harness = Harness::new(
        model,
        rig::tool::ToolSet::builder().build(),
        HarnessConfig::default(),
    );

    let step_config = &program.config.states["stage_b"].step;
    let (tx, _rx) = std::sync::mpsc::channel();
    harness
        .run_step(
            step_config,
            "the verification task",
            handoff.as_deref(),
            &runtime::no_epilogue,
            &tx,
        )
        .await
        .unwrap();

    let seen = client.received_text();
    assert!(seen.contains("You are the verifier."), "prologue missing");
    assert!(seen.contains("Report pass or fail."), "epilogue missing");
    assert!(
        seen.contains("implementation finished; verify against goals"),
        "exit handoff missing: {seen}"
    );
    assert!(seen.contains("the verification task"), "task missing");
}
