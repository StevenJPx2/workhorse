//! Headless smoke proof — the same crate calls the panels make, run end to end
//! without a window. `cargo run -p wh-demo -- --selfcheck`. Exits non-zero on
//! any failure so it can gate CI.

use std::collections::HashMap;

use pipeline::{compile_stage, compiler::WorkflowConfig, parse_expr};
use rig::completion::CompletionModel as _;
use rig::tool::ToolSet;
use runtime::{
    Harness, HarnessConfig, HarnessEvent, MockClient, MockCompletionModel, MockResponse,
    WorkflowRun, WorkflowRunStep,
};
use serde_json::{Value, json};

use crate::compiler_panel::SAMPLE;

pub fn run() {
    let mut failures = 0u32;
    let mut check = |name: &str, ok: bool| {
        println!("[{}] {name}", if ok { "ok " } else { "FAIL" });
        if !ok {
            failures += 1;
        }
    };

    // when expr — parse + evaluate.
    let expr = parse_expr("todo_count == 0 and git_clean").expect("parse");
    let mut state: HashMap<String, Value> = HashMap::new();
    state.insert("todo_count".into(), json!(0));
    state.insert("git_clean".into(), json!(true));
    check(
        "when: guard evaluates true",
        expr.evaluate(&state).unwrap_or(false),
    );

    // config → pipeline — compile + run a stage's ValueOp.
    let config: WorkflowConfig = toml::from_str(SAMPLE).expect("toml");
    let program = compile_stage(&config).expect("compile");
    check("compile: 3 stages", program.config.states.len() == 3);
    let op = program.build_stage_pipeline("plan").expect("stage op");
    let out = pollster::block_on(op.call(json!({ "task": "x" })));
    check(
        "pipeline: stage tags step",
        out.get("step") == Some(&json!("draft")),
    );

    // WorkflowRun — run → gate → park → resume → done.
    // Guards read state keys that must already exist, so seed them.
    let mut wf = WorkflowRun::new("plan", 100_000).with_state(map(&[
        ("todo_count", json!(1)),
        ("status", json!("pending")),
    ]));
    let s1 = wf.next_step(&program).expect("step1");
    check(
        "wf: starts at plan",
        matches!(&s1, WorkflowRunStep::RunStage { stage, .. } if stage == "plan"),
    );
    wf.stage_complete(&program, map(&[("todo_count", json!(0))]), 500)
        .expect("complete plan");
    check("wf: gated to review", wf.current_stage() == "review");
    let _ = wf.next_step(&program).expect("step2");
    wf.stage_complete(&program, HashMap::new(), 500)
        .expect("complete review");
    check("wf: parks on review", wf.is_suspended());

    let snapshot = serde_json::to_string(&wf).expect("serialize parked run");
    let mut resumed: WorkflowRun = serde_json::from_str(&snapshot).expect("deserialize");
    check("wf: snapshot round-trips", resumed.is_suspended());

    resumed
        .resume(&program, map(&[("status", json!("approved"))]))
        .expect("resume");
    check("wf: resumed to done", resumed.current_stage() == "done");
    let last = resumed.next_step(&program).expect("final step");
    check(
        "wf: reports Done",
        matches!(last, WorkflowRunStep::Done { .. }),
    );

    // Harness — generic over the model; drive a scripted MockCompletionModel.
    let client = MockClient::new(vec![MockResponse {
        content: "planned".into(),
        tool_calls: vec![],
    }]);
    let model = MockCompletionModel::make(&client, "mock-model");
    let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
    let events = pollster::block_on(harness.run("plan the work")).expect("harness run");
    check(
        "harness (mock): ends in Done",
        matches!(events.last(), Some(HarnessEvent::Done { output, .. }) if output == "planned"),
    );

    // Registry — register service, build toolset, call tool, teardown.
    check_registry(&mut check);

    // Real model — opt-in. Runs ONLY when a provider key is set, so the
    // default selfcheck stays offline and CI-safe.
    check_real_harness(&mut check);

    println!("\n{failures} checks failed");
    if failures > 0 {
        std::process::exit(1);
    }
    println!("all panels wired ✓");
}

fn map(pairs: &[(&str, Value)]) -> HashMap<String, Value> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

fn check_real_harness(check: &mut dyn FnMut(&str, bool)) {
    let provider = runtime::resolve_provider_from_env();
    match provider {
        runtime::ResolvedProvider::Mock => {
            println!("[skip] harness (real): set ANTHROPIC_API_KEY or OPENCODE_API_KEY");
        }
        runtime::ResolvedProvider::Anthropic {
            api_key,
            model,
            base_url,
        } => {
            println!("[.. ] harness (real/anthropic): calling {model}");
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            let result = if api_key == "oauth" {
                rt.block_on(run_anthropic_oauth(&model))
            } else {
                rt.block_on(run_anthropic_key(&api_key, &model, base_url.as_deref()))
            };
            match result {
                Ok(events) => check(
                    "harness (real/anthropic): ends in Done",
                    matches!(events.last(), Some(HarnessEvent::Done { .. })),
                ),
                Err(e) => check(&format!("harness (real/anthropic): {e}"), false),
            }
        }
        runtime::ResolvedProvider::OpenAICompat {
            base_url,
            api_key,
            model,
        } => {
            println!("[.. ] harness (real/openai-compat): calling {model} @ {base_url}");
            match runtime::openai_compat_model(&base_url, &api_key, &model) {
                Ok(model) => {
                    let harness =
                        Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
                    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
                    match rt.block_on(harness.run("Reply with the single word: ok")) {
                        Ok(events) => check(
                            "harness (real/openai-compat): ends in Done",
                            matches!(events.last(), Some(HarnessEvent::Done { .. })),
                        ),
                        Err(e) => check(&format!("harness (real/openai-compat): {e}"), false),
                    }
                }
                Err(e) => check(
                    &format!("harness (real/openai-compat): build failed: {e}"),
                    false,
                ),
            }
        }
    }
}

async fn run_anthropic_oauth(model: &str) -> Result<Vec<HarnessEvent>, runtime::HarnessError> {
    let m = runtime::anthropic_model_from_oauth(model)
        .await
        .map_err(|e| runtime::HarnessError::AgentRun(e.to_string()))?;
    Harness::new(m, ToolSet::builder().build(), HarnessConfig::default())
        .run("Reply with the single word: ok")
        .await
}

async fn run_anthropic_key(
    api_key: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<Vec<HarnessEvent>, runtime::HarnessError> {
    let m = runtime::anthropic_model_from_creds(api_key, model, base_url)
        .await
        .map_err(|e| runtime::HarnessError::AgentRun(e.to_string()))?;
    Harness::new(m, ToolSet::builder().build(), HarnessConfig::default())
        .run("Reply with the single word: ok")
        .await
}

fn check_registry(check: &mut dyn FnMut(&str, bool)) {
    use services::{Registry, ScriptService};
    use std::path::PathBuf;
    use tools::ToolContext;

    // Real ScriptService: write a script to a temp cwd, then discover + run it.
    let tmp = std::env::temp_dir().join(format!("wh-demo-selfcheck-{}", std::process::id()));
    let home = std::env::var("HOME").map_or_else(|_| PathBuf::from("/tmp"), PathBuf::from);
    let ctx = ToolContext::new(&tmp);

    let svc = ScriptService::new(
        tmp.clone(),
        home,
        std::sync::Arc::new(sandbox::LocalSandbox::new()),
    );
    let mut reg = Registry::new();
    reg.register(svc);

    let toolset = pollster::block_on(reg.build_toolset(&ctx));
    let defs = pollster::block_on(toolset.get_tool_definitions()).unwrap_or_default();
    check(
        "registry: ScriptService contributes run/read/write_script",
        defs.iter().any(|d| d.name == "run_script")
            && defs.iter().any(|d| d.name == "write_script")
            && defs.iter().any(|d| d.name == "read_script"),
    );

    // write_script → a real file under <tmp>/.workhorse/scripts.
    let write_args = r#"{"name":"selfcheck_echo","command":"echo \"hi $1\"","description":"echo test","args":{"positional":[{"name":"who","description":"who","required":true}]}}"#;
    let wrote = pollster::block_on(toolset.call("write_script", write_args.to_string()));
    check("registry: write_script saves a real file", wrote.is_ok());

    // Rebuild so discovery picks up the new script.
    let toolset2 = pollster::block_on(reg.build_toolset(&ctx));

    // read_script returns the raw source.
    let read = pollster::block_on(
        toolset2.call("read_script", r#"{"name":"selfcheck_echo"}"#.to_string()),
    );
    check(
        "registry: read_script returns source",
        read.as_ref().is_ok_and(|r| r.contains("echo")),
    );

    // run_script executes through the sandbox.
    let run = pollster::block_on(toolset2.call(
        "run_script",
        r#"{"name":"selfcheck_echo","positional":["world"]}"#.to_string(),
    ));
    let ran_ok = run.as_ref().is_ok_and(|r| r.contains("hi world"));
    check("registry: run_script executes in sandbox", ran_ok);

    // Cleanup.
    pollster::block_on(reg.teardown(&ctx));
    let _ = std::fs::remove_dir_all(&tmp);
}
