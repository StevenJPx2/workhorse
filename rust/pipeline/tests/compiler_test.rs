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
    let expr = parse_expr("builtin::always").unwrap();
    assert_eq!(
        expr,
        Expr::Builtin {
            name: "always".into()
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
    let expr = parse_expr("builtin::always").unwrap();
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
        states: vec![
            StageConfig {
                name: "planning".into(),
                steps: vec!["prompt".into()],
                exits: vec![ExitRule {
                    when: "todos_complete".into(),
                    to: "implementing".into(),
                    epilogue: None,
                }],
            },
            StageConfig {
                name: "implementing".into(),
                steps: vec!["coder".into()],
                exits: vec![ExitRule {
                    when: "todos_complete".into(),
                    to: "done".into(),
                    epilogue: None,
                }],
            },
        ],
        steps: {
            let mut m = HashMap::new();
            m.insert(
                "prompt".into(),
                StepConfig {
                    preset: Some("prompt".into()),
                    prologue: Some("Enrich the issue".into()),
                    epilogue: Some("Output the enriched prompt".into()),
                    ..Default::default()
                },
            );
            m.insert(
                "coder".into(),
                StepConfig {
                    preset: Some("coding".into()),
                    prologue: Some("Implement the plan".into()),
                    epilogue: None,
                    ..Default::default()
                },
            );
            m
        },
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
        states: vec![StageConfig {
            name: "s1".into(),
            steps: vec!["a".into(), "b".into()],
            exits: vec![],
        }],
        steps: {
            let mut m = HashMap::new();
            m.insert(
                "a".into(),
                StepConfig {
                    prologue: Some("step A".into()),
                    ..Default::default()
                },
            );
            m.insert(
                "b".into(),
                StepConfig {
                    epilogue: Some("step B".into()),
                    ..Default::default()
                },
            );
            m
        },
    };

    let program = compile_stage(&config).unwrap();
    let pipeline = program.build_stage_pipeline("s1").unwrap();

    let input = json!({});
    let output = pipeline.call(input).await;

    assert_eq!(output["step"], "b");
    assert_eq!(output["prologue"], "step A");
    assert_eq!(output["epilogue"], "step B");
}
