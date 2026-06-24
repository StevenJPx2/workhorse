use std::collections::HashMap;

use pipeline::compiler::{ExitRule, StageConfig, StepConfig, WorkflowConfig};
use pipeline::{WorkflowProgram, compile_stage};
use runtime::{WorkflowError, WorkflowRun, WorkflowRunStep};
use serde_json::{Value, json};

/// Two-stage loop + park config:
///   `stage_a` --always--> `stage_b`
///   `stage_b` --`iteration_count` >= 3--> `park_stage`   (exit loop)
///   `stage_b` --`iteration_count` < 3--> `stage_a`        (loop back)
///   `park_stage` --approved--> `done`                   (parks until approved)
///   `done`                                            (terminal, no exits)
fn build_program() -> WorkflowProgram {
    let mut steps = HashMap::new();
    for id in ["a", "b", "p"] {
        steps.insert(id.to_string(), StepConfig::default());
    }

    let config = WorkflowConfig {
        name: "loop_park".into(),
        version: "1".into(),
        states: vec![
            StageConfig {
                name: "stage_a".into(),
                steps: vec!["a".into()],
                exits: vec![ExitRule {
                    when: "builtin::always".into(),
                    to: "stage_b".into(),
                    epilogue: None,
                }],
            },
            StageConfig {
                name: "stage_b".into(),
                steps: vec!["b".into()],
                exits: vec![
                    ExitRule {
                        when: "iteration_count >= 3".into(),
                        to: "park_stage".into(),
                        epilogue: None,
                    },
                    ExitRule {
                        when: "iteration_count < 3".into(),
                        to: "stage_a".into(),
                        epilogue: None,
                    },
                ],
            },
            StageConfig {
                name: "park_stage".into(),
                steps: vec!["p".into()],
                exits: vec![ExitRule {
                    when: "approved".into(),
                    to: "done".into(),
                    epilogue: None,
                }],
            },
            StageConfig {
                name: "done".into(),
                steps: vec![],
                exits: vec![],
            },
        ],
        steps,
    };

    compile_stage(&config).unwrap()
}

fn initial_state() -> HashMap<String, Value> {
    let mut s = HashMap::new();
    s.insert("iteration_count".into(), json!(0));
    s.insert("approved".into(), json!(false));
    s
}

#[test]
fn loop_then_park_then_resume_to_completion() {
    let program = build_program();
    let mut run = WorkflowRun::new("stage_a", 100_000).with_state(initial_state());

    let mut iteration = 0;
    let mut suspended_once = false;
    let mut stage_runs = Vec::new();

    for _ in 0..50 {
        let step = run.next_step(&program).unwrap();
        match step {
            WorkflowRunStep::RunStage { stage, .. } => {
                stage_runs.push(stage.clone());
                let mut updates = HashMap::new();
                if stage == "stage_b" {
                    iteration += 1;
                    updates.insert("iteration_count".to_string(), json!(iteration));
                }
                run.stage_complete(&program, updates, 100).unwrap();
            }
            WorkflowRunStep::Suspend { stage } => {
                assert_eq!(stage, "park_stage");
                suspended_once = true;

                // Park: serialize the run, then resume it from the serialized state.
                let serialized = serde_json::to_string(&run).unwrap();
                let mut resumed: WorkflowRun = serde_json::from_str(&serialized).unwrap();

                // External StatusChanged event flips approved.
                let mut event = HashMap::new();
                event.insert("approved".to_string(), json!(true));
                resumed.resume(&program, event).unwrap();
                run = resumed;
            }
            WorkflowRunStep::Done { stage } => {
                assert_eq!(stage, "done");
                assert!(suspended_once, "should have parked before completing");
                assert!(run.is_done());
                // stage_b ran exactly 3 times (loop terminated at iteration_count == 3)
                let b_runs = stage_runs.iter().filter(|s| *s == "stage_b").count();
                assert_eq!(b_runs, 3);
                let a_runs = stage_runs.iter().filter(|s| *s == "stage_a").count();
                assert_eq!(a_runs, 3);
                return;
            }
            WorkflowRunStep::Cancelled => panic!("unexpected cancel"),
        }
    }

    panic!("workflow did not complete within 50 steps");
}

#[test]
fn suspend_serializes_and_resumes_in_fresh_run() {
    let program = build_program();
    let mut run = WorkflowRun::new("park_stage", 100_000).with_state(initial_state());

    // Run park_stage once; approved is false → suspend.
    let step = run.next_step(&program).unwrap();
    assert!(matches!(step, WorkflowRunStep::RunStage { stage, .. } if stage == "park_stage"));
    run.stage_complete(&program, HashMap::new(), 50).unwrap();

    let step = run.next_step(&program).unwrap();
    assert_eq!(
        step,
        WorkflowRunStep::Suspend {
            stage: "park_stage".into()
        }
    );
    assert!(run.is_suspended());

    // Serialize, drop, rebuild from bytes — proves sans-IO resume.
    let bytes = serde_json::to_vec(&run).unwrap();
    drop(run);
    let mut resumed: WorkflowRun = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(resumed.total_tokens(), 50);

    let mut event = HashMap::new();
    event.insert("approved".to_string(), json!(true));
    resumed.resume(&program, event).unwrap();

    let step = resumed.next_step(&program).unwrap();
    assert_eq!(
        step,
        WorkflowRunStep::Done {
            stage: "done".into()
        }
    );
}

#[test]
fn run_stage_carries_fired_exit_epilogue_as_handoff() {
    let mut steps = HashMap::new();
    steps.insert("x".to_string(), StepConfig::default());
    steps.insert("y".to_string(), StepConfig::default());

    let config = WorkflowConfig {
        name: "handoff".into(),
        version: "1".into(),
        states: vec![
            StageConfig {
                name: "stage_x".into(),
                steps: vec!["x".into()],
                exits: vec![ExitRule {
                    when: "builtin::always".into(),
                    to: "stage_y".into(),
                    epilogue: Some("summarise for verification".into()),
                }],
            },
            StageConfig {
                name: "stage_y".into(),
                steps: vec!["y".into()],
                exits: vec![ExitRule {
                    when: "approved".into(),
                    to: "done".into(),
                    epilogue: None,
                }],
            },
        ],
        steps,
    };
    let program = compile_stage(&config).unwrap();

    let mut run = WorkflowRun::new("stage_x", 100_000).with_state({
        let mut s = HashMap::new();
        s.insert("approved".into(), json!(false));
        s
    });

    // Entry stage: no preceding exit → no handoff.
    let step = run.next_step(&program).unwrap();
    assert_eq!(
        step,
        WorkflowRunStep::RunStage {
            stage: "stage_x".into(),
            handoff: None
        }
    );

    run.stage_complete(&program, HashMap::new(), 10).unwrap();

    // After the always-exit fires, its epilogue rides into stage_y.
    let step = run.next_step(&program).unwrap();
    assert_eq!(
        step,
        WorkflowRunStep::RunStage {
            stage: "stage_y".into(),
            handoff: Some("summarise for verification".into()),
        }
    );
}

#[test]
fn cancel_at_boundary() {
    let program = build_program();
    let mut run = WorkflowRun::new("stage_a", 100_000).with_state(initial_state());

    let step = run.next_step(&program).unwrap();
    assert!(matches!(step, WorkflowRunStep::RunStage { .. }));

    run.cancel();

    let step = run.next_step(&program).unwrap();
    assert_eq!(step, WorkflowRunStep::Cancelled);
}

#[test]
fn token_budget_aggregates_across_stages() {
    let program = build_program();
    let mut run = WorkflowRun::new("stage_a", 250).with_state(initial_state());

    // Each stage costs 100 tokens; the 3rd stage run pushes total to 300 > 250.
    let mut err = None;
    for _ in 0..10 {
        match run.next_step(&program).unwrap() {
            WorkflowRunStep::RunStage { .. } => {
                if let Err(e) = run.stage_complete(&program, HashMap::new(), 100) {
                    err = Some(e);
                    break;
                }
            }
            _ => break,
        }
    }

    assert!(matches!(
        err,
        Some(WorkflowError::BudgetExceeded {
            used: 300,
            budget: 250
        })
    ));
}

#[test]
fn protocol_violation_on_double_step() {
    let program = build_program();
    let mut run = WorkflowRun::new("stage_a", 100_000).with_state(initial_state());

    run.next_step(&program).unwrap();
    // Calling next_step again without stage_complete is a protocol violation.
    let result = run.next_step(&program);
    assert!(matches!(result, Err(WorkflowError::Protocol(_))));
}
