use std::collections::HashMap;

use pipeline::compiler::{ExitRule, StageConfig, StepConfig, WorkflowConfig};
use pipeline::{Expr, ExprError, compile_stage, parse_expr};
use serde_json::json;

fn state(pairs: &[(&str, serde_json::Value)]) -> HashMap<String, serde_json::Value> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

#[test]
fn parse_state_key() {
    let expr = parse_expr("todos_complete").unwrap();
    assert_eq!(
        expr,
        Expr::StateKey {
            key: "todos_complete".into()
        }
    );
}

#[test]
fn parse_string_equality() {
    let expr = parse_expr(r#"checks_status == "passed""#).unwrap();
    assert!(matches!(expr, Expr::Comparison { .. }));
}

#[test]
fn parse_numeric_comparison() {
    let expr = parse_expr("open_review_threads > 0").unwrap();
    assert!(matches!(expr, Expr::Comparison { .. }));
}

#[test]
fn stage_inherits_preset_with_explicit_fields_overriding() {
    // A stage names `preset = "coding"`; the preset supplies tools + token_budget
    // + prologue, the stage overrides the prologue and adds nothing else.
    let cfg = r#"name = "p"
version = "1"
initial = "work"

[presets.coding]
prologue = "preset prologue"
tools = ["fs_read", "fs_write"]
token_budget = 9000

[states.work]
preset = "coding"
prologue = "stage prologue wins"
[states.done]
"#;
    let config: WorkflowConfig = toml::from_str(cfg).expect("toml");
    let program = compile_stage(&config).expect("compile");
    let work = program
        .config
        .states
        .get("work")
        .expect("work")
        .step
        .clone();

    // Stage's explicit prologue wins; unset fields inherit the preset.
    assert_eq!(work.prologue.as_deref(), Some("stage prologue wins"));
    assert_eq!(
        work.tools,
        vec!["fs_read".to_string(), "fs_write".to_string()]
    );
    assert_eq!(work.token_budget, Some(9000));
    // The preset marker is consumed after resolution.
    assert!(work.preset.is_none());
}

#[test]
fn merge_step_prefers_over_then_base() {
    use pipeline::compiler::{StepConfig, merge_step};
    let base = StepConfig {
        prologue: Some("base".into()),
        epilogue: Some("base-epi".into()),
        tools: vec!["a".into()],
        token_budget: Some(100),
        ..Default::default()
    };
    let over = StepConfig {
        prologue: Some("over".into()),
        tools: vec![],      // empty -> inherit base
        token_budget: None, // None -> inherit base
        ..Default::default()
    };
    let merged = merge_step(&base, &over);
    assert_eq!(merged.prologue.as_deref(), Some("over"));
    assert_eq!(merged.epilogue.as_deref(), Some("base-epi"));
    assert_eq!(merged.tools, vec!["a".to_string()]);
    assert_eq!(merged.token_budget, Some(100));
    assert!(merged.preset.is_none());
}

#[test]
fn parse_entry_suffixed_state_key() {
    // `count@entry` (stage-entry snapshot) parses as a single state key, and a
    // comparison against it evaluates correctly via the augmented guard state.
    let expr = parse_expr("count != count@entry").unwrap();
    assert!(matches!(expr, Expr::Comparison { .. }));
    assert_eq!(expr.known_keys(), vec!["count".to_string()]);

    let mut state = std::collections::HashMap::new();
    state.insert("count".to_string(), serde_json::json!(2));
    state.insert("count@entry".to_string(), serde_json::json!(1));
    assert!(
        expr.evaluate(&state).unwrap(),
        "2 != 1 -> changed this stage"
    );

    state.insert("count@entry".to_string(), serde_json::json!(2));
    assert!(!expr.evaluate(&state).unwrap(), "2 != 2 -> unchanged");
}

#[test]
fn parse_and_combinator() {
    let expr = parse_expr("a and b").unwrap();
    assert!(matches!(expr, Expr::And { .. }));
}

#[test]
fn parse_or_combinator() {
    let expr = parse_expr("a or b").unwrap();
    assert!(matches!(expr, Expr::Or { .. }));
}

#[test]
fn parse_not_combinator() {
    let expr = parse_expr("not a").unwrap();
    assert!(matches!(expr, Expr::Not { .. }));
}

#[test]
fn parse_parenthesized() {
    let expr = parse_expr("(a or b) and c").unwrap();
    assert!(matches!(expr, Expr::And { .. }));
}

#[test]
fn parse_builtin() {
    let expr = parse_expr("builtin::paused").unwrap();
    assert_eq!(
        expr,
        Expr::Builtin {
            name: "paused".into()
        }
    );
}

#[test]
fn parse_file_exists() {
    let expr = parse_expr(r#"file_exists("/tmp/flag")"#).unwrap();
    assert!(matches!(expr, Expr::FileExists { .. }));
}

#[test]
fn evaluate_truthy_state_key() {
    let expr = parse_expr("todos_complete").unwrap();
    let st = state(&[("todos_complete", json!(true))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_falsy_state_key() {
    let expr = parse_expr("todos_complete").unwrap();
    let st = state(&[("todos_complete", json!(false))]);
    assert!(!expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_string_equality() {
    let expr = parse_expr(r#"checks_status == "passed""#).unwrap();
    let st = state(&[("checks_status", json!("passed"))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_string_inequality() {
    let expr = parse_expr(r#"checks_status != "passed""#).unwrap();
    let st = state(&[("checks_status", json!("failed"))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_numeric_eq_int_state_against_parsed_float() {
    // Parser literals are f64; state may hold ints. `== 0` must hold for int 0.
    let expr = parse_expr("todo_count == 0").unwrap();
    assert!(expr.evaluate(&state(&[("todo_count", json!(0))])).unwrap());
    assert!(!expr.evaluate(&state(&[("todo_count", json!(3))])).unwrap());

    let ne = parse_expr("todo_count != 0").unwrap();
    assert!(ne.evaluate(&state(&[("todo_count", json!(3))])).unwrap());
    assert!(!ne.evaluate(&state(&[("todo_count", json!(0))])).unwrap());
}

#[test]
fn evaluate_numeric_gt() {
    let expr = parse_expr("open_review_threads > 0").unwrap();
    let st = state(&[("open_review_threads", json!(3))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_and() {
    let expr = parse_expr("a and b").unwrap();
    let st = state(&[("a", json!(true)), ("b", json!(true))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_or() {
    let expr = parse_expr("a or b").unwrap();
    let st = state(&[("a", json!(false)), ("b", json!(true))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_not() {
    let expr = parse_expr("not a").unwrap();
    let st = state(&[("a", json!(false))]);
    assert!(expr.evaluate(&st).unwrap());
}

#[test]
fn evaluate_builtin_always() {
    let expr = parse_expr("builtin::paused").unwrap();
    assert!(expr.evaluate(&HashMap::new()).unwrap());
}

#[test]
fn evaluate_builtin_never() {
    let expr = parse_expr("builtin::never").unwrap();
    assert!(!expr.evaluate(&HashMap::new()).unwrap());
}

#[test]
fn reject_unknown_builtin() {
    let expr = parse_expr("builtin::bogus").unwrap();
    let result = expr.evaluate(&HashMap::new());
    assert!(matches!(result, Err(ExprError::UnknownBuiltin(_))));
}

#[test]
fn reject_unknown_state_key() {
    let expr = parse_expr("missing_key").unwrap();
    let result = expr.evaluate(&HashMap::new());
    assert!(matches!(result, Err(ExprError::UnknownKey(_))));
}

#[test]
fn round_trip_expr_string_to_ast_to_eval() {
    let cases = [
        ("todos_complete", true),
        (r#"checks_status == "passed""#, true),
        (r#"checks_status != "passed""#, false),
        ("open_review_threads > 0", true),
        ("a and b", true),
        ("a or not b", true),
    ];

    let st = state(&[
        ("todos_complete", json!(true)),
        ("checks_status", json!("passed")),
        ("open_review_threads", json!(5)),
        ("a", json!(true)),
        ("b", json!(true)),
    ]);

    for (src, expected) in cases {
        let expr = parse_expr(src).unwrap();
        let result = expr.evaluate(&st).unwrap();
        assert_eq!(result, expected, "failed for: {src}");
    }
}

#[test]
fn compile_workflow_with_exits() {
    let config = WorkflowConfig {
        name: "test".into(),
        version: "1".into(),
        initial: "planning".into(),
        states: indexmap::IndexMap::from([
            (
                "planning".to_string(),
                StageConfig {
                    step: StepConfig {
                        preset: Some("prompt".into()),
                        prologue: Some("Enrich the issue".into()),
                        epilogue: Some("Output the enriched prompt".into()),
                        ..Default::default()
                    },
                    exits: vec![ExitRule {
                        when: "todos_complete".into(),
                        to: "implementing".into(),
                        epilogue: None,
                    }],
                },
            ),
            (
                "implementing".to_string(),
                StageConfig {
                    step: StepConfig {
                        preset: Some("coding".into()),
                        prologue: Some("Implement the plan".into()),
                        ..Default::default()
                    },
                    exits: vec![ExitRule {
                        when: "todos_complete".into(),
                        to: "done".into(),
                        epilogue: None,
                    }],
                },
            ),
        ]),
        presets: std::collections::HashMap::new(),
    };

    let program = compile_stage(&config).unwrap();

    assert!(program.compiled_exits.contains_key("planning"));
    assert!(program.compiled_exits.contains_key("implementing"));

    let planning_exits = &program.compiled_exits["planning"];
    assert_eq!(planning_exits.len(), 1);
    assert_eq!(planning_exits[0].to, "implementing");
    assert!(matches!(planning_exits[0].expr, Expr::StateKey { .. }));
}

#[tokio::test]
async fn build_and_run_stage_pipeline() {
    let config = WorkflowConfig {
        name: "test".into(),
        version: "1".into(),
        initial: "s1".into(),
        states: indexmap::IndexMap::from([(
            "s1".to_string(),
            StageConfig {
                step: StepConfig {
                    prologue: Some("step A".into()),
                    epilogue: Some("step B".into()),
                    ..Default::default()
                },
                exits: vec![],
            },
        )]),
        presets: std::collections::HashMap::new(),
    };

    let program = compile_stage(&config).unwrap();
    let pipeline = program.build_stage_pipeline("s1").unwrap();

    let input = json!({});
    let output = pipeline.call(input).await;

    assert_eq!(output["stage"], "s1");
    assert_eq!(output["prologue"], "step A");
    assert_eq!(output["epilogue"], "step B");
}
