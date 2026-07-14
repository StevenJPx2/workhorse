//! Headless smoke proof — the same crate calls the panels make, run end to end
//! without a window. `cargo run -p wh-demo -- --selfcheck`. Exits non-zero on
//! any failure so it can gate CI.

use std::collections::HashMap;
use std::sync::mpsc;

use pipeline::{compile_stage, compiler::WorkflowConfig, parse_expr};
use rig::completion::CompletionModel as _;
use rig::tool::ToolSet;
use runtime::{
    Harness, HarnessConfig, HarnessEvent, MockClient, MockCompletionModel, MockResponse,
    MockToolCall, WorkflowRun, WorkflowRunStep,
};
use serde_json::{Value, json};

use crate::compiler_panel::SAMPLE;

/// The smoke proof itself, returning pass/fail so both the `--selfcheck` binary
/// and the `cargo test` wrapper can drive it without one duplicating the other.
pub fn check_all() -> bool {
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
        "pipeline: stage tags output with its name",
        out.get("stage") == Some(&json!("plan")),
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

    // Orchestrator — drive a whole workflow end to end through the Harness.
    check_orchestrator(&mut check);

    // Park & resume — a stage parks on an external guard, then an external event
    // resumes it to Done.
    check_resume(&mut check);

    // Sub-agents — a stage spawns a leaf sub-agent (one level deep) and gets its
    // output back as a tool result.
    check_subagent(&mut check);

    // Persistence — a run persisted at a boundary reloads and resumes (crash
    // recovery).
    check_persist(&mut check);

    // Preset inheritance — a stage's `preset` is merged in, with stage fields
    // overriding.
    check_preset(&mut check);

    // wh facade — discover a workflow from a .workhorse dir, cascade presets,
    // compile.
    check_wh_facade(&mut check);

    // Registry — register service, build toolset, call tool, teardown.
    check_registry(&mut check);

    // ContextService — the memory-weaver scratchpad (write/read context.md).
    check_context_service(&mut check);

    // Builder — model <-> TOML roundtrip preserves each preset losslessly.
    check_builder(&mut check);

    // Real model — opt-in. Runs ONLY when a provider key is set, so the
    // default selfcheck stays offline and CI-safe.
    check_real_harness(&mut check);

    println!("\n{failures} checks failed");
    failures == 0
}

pub fn run() {
    if !check_all() {
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

/// Preset-aware scripted mock replies. State is NEVER set by the model: `work`/
/// `draft` turns call `increment_counter` (the deterministic source); the guards
/// route on the resulting `count`. Weaver turns are plain text. The mock cycles.
fn mock_responses_for(_preset_name: &str) -> Vec<MockResponse> {
    let text = |s: &str| MockResponse {
        content: s.into(),
        tool_calls: vec![],
    };
    let inc = MockResponse {
        content: "incrementing".into(),
        tool_calls: vec![MockToolCall {
            id: "c".into(),
            name: "increment_counter".into(),
            arguments: json!({}),
        }],
    };
    vec![inc, text("incremented"), text("recorded")]
}

/// A toolset carrying the demo counter (`increment_counter`) — the deterministic
/// state source the presets route on.
fn counter_toolset() -> (ToolSet, HashMap<String, Value>) {
    use services::Registry;
    use tools::ToolContext;
    let mut reg = Registry::new();
    reg.register(std::sync::Arc::new(
        crate::demo_counter::CounterService::default(),
    ));
    pollster::block_on(reg.build_toolset_with_state(&ToolContext::new(std::env::temp_dir())))
}

fn check_orchestrator(check: &mut dyn FnMut(&str, bool)) {
    use runtime::{OrchestratorEvent, Outcome};

    // Every bundled preset completes end to end — driven ONLY by the
    // deterministic counter tool (no @state, no agent-set routing state). The
    // counter OWNS `count` (Tool::produces), which auto-seeds the run.
    for preset in crate::presets::presets() {
        // The sub-agent preset needs a spawn_subagent tool (live model) — it has
        // its own dedicated check (`check_subagent`), so skip it in this
        // counter-only loop.
        if preset.name == "subagent-demo" {
            continue;
        }
        let config: WorkflowConfig = toml::from_str(preset.config).expect("preset config parses");
        let program = compile_stage(&config).expect("preset config compiles");
        let initial = config.initial.clone();

        let client = MockClient::new(mock_responses_for(preset.name));
        let model = MockCompletionModel::make(&client, "mock-model");
        let (toolset, produced) = counter_toolset();
        // Guards may only read keys a tool produces or the preset seeds.
        let mut seed = preset.seed();
        seed.extend(produced);
        let available: std::collections::HashSet<String> = seed.keys().cloned().collect();
        check(
            &format!(
                "builder/orchestrator: preset `{}` state keys validate",
                preset.name
            ),
            runtime::validate_state_keys(&program, &available).is_ok(),
        );
        let harness = Harness::new(model, toolset, HarnessConfig::default());
        let mut run = WorkflowRun::new(initial, 10_000_000).with_state(seed);

        let (tx, rx) = mpsc::channel();
        let outcome = pollster::block_on(runtime::run_to_completion(
            &harness,
            &program,
            &mut run,
            preset.task,
            &tx,
        ));
        drop(tx);

        let weaver_runs = rx.iter().filter(|ev| {
            matches!(ev, OrchestratorEvent::StageEntered { stage, .. } if stage == "memory_weaver")
        }).count();

        check(
            &format!("orchestrator: preset `{}` ends Done", preset.name),
            matches!(outcome, Ok(Outcome::Done { .. })),
        );
        if preset.name == "ralph-loop" {
            check(
                "orchestrator: ralph-loop iterates via memory_weaver before finishing",
                weaver_runs >= 1,
            );
        }
    }
}

fn check_resume(check: &mut dyn FnMut(&str, bool)) {
    use runtime::{ExternalEvent, Outcome};

    // A stage that parks waiting for an external sign-off, then resumes on the
    // event and drives to Done — the in_review -> done holding pattern.
    let cfg = r#"name = "review"
version = "1"
initial = "in_review"
[states.in_review]
prologue = "Wait for sign-off."
[[states.in_review.exits]]
when = "approved == true"
to = "done"
[states.done]
"#;
    let config: WorkflowConfig = toml::from_str(cfg).expect("resume config parses");
    let program = compile_stage(&config).expect("resume config compiles");
    let client = MockClient::new(vec![runtime::MockResponse {
        content: "awaiting review".into(),
        tool_calls: vec![],
    }]);
    let model = MockCompletionModel::make(&client, "mock-model");
    let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
    let mut run = WorkflowRun::new("in_review", 10_000_000)
        .with_state(map(&[("approved", Value::Bool(false))]));

    let (tx, _rx) = mpsc::channel();
    let parked = pollster::block_on(runtime::run_to_completion(
        &harness, &program, &mut run, "review", &tx,
    ));
    check(
        "orchestrator: parks waiting for external sign-off",
        matches!(parked, Ok(Outcome::Suspended { .. })),
    );

    let (tx2, _rx2) = mpsc::channel();
    let resumed = pollster::block_on(runtime::resume_workflow(
        &harness,
        &program,
        &mut run,
        "review",
        runtime::DEFAULT_MAX_STAGE_RUNS,
        runtime::DriveOptions::default(),
        ExternalEvent::with("approved", true),
        &tx2,
    ));
    check(
        "orchestrator: resumes to Done on external sign-off event",
        matches!(resumed, Ok(Outcome::Done { .. })),
    );
}

fn check_wh_facade(check: &mut dyn FnMut(&str, bool)) {
    // Write a temp .workhorse/ with a workflow + a project preset patch, then let
    // the facade discover + cascade + compile it.
    let cwd = std::env::temp_dir().join(format!("wh-facade-selfcheck-{}", std::process::id()));
    let wf = cwd.join(".workhorse/workflows");
    if std::fs::create_dir_all(&wf).is_err() {
        check("wh: mkdir", false);
        return;
    }
    let _ = std::fs::write(
        wf.join("ralph.toml"),
        r#"name = "ralph"
version = "1"
initial = "work"
[states.work]
preset = "coding"
[[states.work.exits]]
when = "count >= 1"
to = "done"
[states.done]
"#,
    );
    let _ = std::fs::write(
        cwd.join(".workhorse/config.toml"),
        "[presets.coding]\nprologue = \"project coding preset\"\ntools = [\"fs_read\"]\n",
    );

    match wh::prepare_workflow(&cwd, &cwd, "ralph") {
        Ok(program) => {
            let work = program.config.states.get("work").map(|s| s.step.clone());
            let ok = work.is_some_and(|w| {
                w.prologue.as_deref() == Some("project coding preset")
                    && w.tools == vec!["fs_read".to_string()]
            });
            check("wh: facade discovers + cascades + compiles a workflow", ok);
        }
        Err(e) => check(&format!("wh: prepare_workflow: {e}"), false),
    }
    let _ = std::fs::remove_dir_all(&cwd);
}

fn check_preset(check: &mut dyn FnMut(&str, bool)) {
    let cfg = r#"name = "p"
version = "1"
initial = "work"
[presets.coding]
prologue = "preset prologue"
tools = ["fs_read", "fs_write"]
token_budget = 9000
[states.work]
preset = "coding"
prologue = "stage wins"
[states.done]
"#;
    let Ok(config) = toml::from_str::<WorkflowConfig>(cfg) else {
        check("preset: config parses", false);
        return;
    };
    let program = compile_stage(&config).expect("preset config compiles");
    let work = program.config.states.get("work").map(|s| s.step.clone());
    let ok = work.is_some_and(|w| {
        w.prologue.as_deref() == Some("stage wins")
            && w.tools == vec!["fs_read".to_string(), "fs_write".to_string()]
            && w.token_budget == Some(9000)
            && w.preset.is_none()
    });
    check(
        "preset: stage inherits preset, explicit fields override",
        ok,
    );
}

fn check_persist(check: &mut dyn FnMut(&str, bool)) {
    use runtime::{ExternalEvent, Outcome, RunStore};

    let cfg = r#"name = "review"
version = "1"
initial = "in_review"
[states.in_review]
prologue = "Wait."
[[states.in_review.exits]]
when = "approved == true"
to = "done"
[states.done]
"#;
    let config: WorkflowConfig = match toml::from_str(cfg) {
        Ok(c) => c,
        Err(e) => {
            check(&format!("persist: config parses: {e}"), false);
            return;
        }
    };
    let program = compile_stage(&config).expect("persist config compiles");
    let make = || {
        let client = MockClient::new(vec![runtime::MockResponse {
            content: "waiting".into(),
            tool_calls: vec![],
        }]);
        Harness::new(
            MockCompletionModel::make(&client, "mock"),
            rig::tool::ToolSet::builder().build(),
            HarnessConfig::default(),
        )
    };
    let tmp = std::env::temp_dir().join(format!("wh-selfcheck-persist-{}", std::process::id()));
    let store = RunStore::for_issue(&tmp, "DEMO-1");

    // Run until parked, persisting each boundary; then drop (simulated crash).
    {
        let harness = make();
        let mut run = WorkflowRun::new("in_review", 10_000_000)
            .with_state(map(&[("approved", Value::Bool(false))]));
        let (tx, _rx) = mpsc::channel();
        let _ = pollster::block_on(runtime::run_with_limit(
            &harness,
            &program,
            &mut run,
            "review",
            runtime::DEFAULT_MAX_STAGE_RUNS,
            runtime::DriveOptions::default().with_persist(&store),
            &tx,
        ));
    }

    // Reload from disk and resume on the external sign-off.
    let reloaded = store.load();
    check("persist: run reloads from disk", reloaded.is_some());
    if let Some(mut run) = reloaded {
        let harness = make();
        let (tx, _rx) = mpsc::channel();
        let resumed = pollster::block_on(runtime::resume_workflow(
            &harness,
            &program,
            &mut run,
            "review",
            runtime::DEFAULT_MAX_STAGE_RUNS,
            runtime::DriveOptions::default(),
            ExternalEvent::with("approved", true),
            &tx,
        ));
        check(
            "persist: reloaded run resumes to Done",
            matches!(resumed, Ok(Outcome::Done { .. })),
        );
    }
    let _ = std::fs::remove_dir_all(&tmp);
}

fn check_subagent(check: &mut dyn FnMut(&str, bool)) {
    use pipeline::compiler::SubAgentTemplate;
    use runtime::Outcome;
    use tools::{RigToolBridge, ToolContext};

    // The bundled sub-agent preset: work spawns a leaf sub-agent, then marks the
    // to-do done via the counter; `count >= 1` routes to done.
    let cfg = crate::presets::SUBAGENT_DEMO_CONFIG;
    let config: WorkflowConfig = match toml::from_str(cfg) {
        Ok(c) => c,
        Err(e) => {
            check(&format!("subagent: config parses: {e}"), false);
            return;
        }
    };
    let program = compile_stage(&config).expect("subagent config compiles");

    // Parent mock: turn 1 calls spawn_subagent, turn 2 calls increment_counter,
    // turn 3 finishes. The leaf mock (its own client) returns a fixed line.
    let parent = MockClient::new(vec![
        runtime::MockResponse {
            content: "spawning researcher".into(),
            tool_calls: vec![runtime::MockToolCall {
                id: "s1".into(),
                name: "spawn_subagent".into(),
                arguments: serde_json::json!({ "template": "researcher", "task": "survey the code" }),
            }],
        },
        runtime::MockResponse {
            content: "marking done".into(),
            tool_calls: vec![runtime::MockToolCall {
                id: "c1".into(),
                name: "increment_counter".into(),
                arguments: serde_json::json!({}),
            }],
        },
        runtime::MockResponse {
            content: "all done".into(),
            tool_calls: vec![],
        },
    ]);
    let model = MockCompletionModel::make(&parent, "mock-parent");

    // Leaf model + the spawn tool that runs it (no leaf tools => true leaf).
    let leaf_client = MockClient::new(vec![runtime::MockResponse {
        content: "researcher: found 3 modules".into(),
        tool_calls: vec![],
    }]);
    let leaf_model = MockCompletionModel::make(&leaf_client, "mock-leaf");
    let template = SubAgentTemplate {
        name: "researcher".into(),
        model: None,
        tools: vec![],
        write_globs: vec![],
    };
    let spawn = runtime::spawn_subagent_tool(
        leaf_model,
        vec![template],
        vec![],
        ToolContext::new(std::env::temp_dir()),
        HarnessConfig::default(),
    );

    // Base toolset (counter) + the spawn tool.
    let (mut toolset, produced) = counter_toolset();
    toolset.add_tool(RigToolBridge::new(
        spawn,
        std::sync::Arc::new(ToolContext::new(std::env::temp_dir())),
    ));

    let mut seed = HashMap::new();
    seed.extend(produced);
    let _ = seed.entry("count".to_string()).or_insert(Value::from(0));

    let harness = Harness::new(model, toolset, HarnessConfig::default());
    let mut run = WorkflowRun::new("work", 10_000_000).with_state(seed);
    let (tx, rx) = mpsc::channel();
    let outcome = pollster::block_on(runtime::run_to_completion(
        &harness, &program, &mut run, "go", &tx,
    ));
    drop(tx);

    // The leaf's output should appear as a tool-result in the transcript.
    let saw_leaf = rx.iter().any(|ev| {
        matches!(ev, runtime::OrchestratorEvent::Harness(HarnessEvent::ToolResult { name, result, .. })
            if name == "spawn_subagent" && result.contains("found 3 modules"))
    });

    check(
        "subagent: work stage spawns a leaf and reaches Done",
        matches!(outcome, Ok(Outcome::Done { .. })),
    );
    check(
        "subagent: leaf sub-agent output returned to parent",
        saw_leaf,
    );
}

fn check_builder(check: &mut dyn FnMut(&str, bool)) {
    use pipeline::compiler::WorkflowConfig;

    // Same stages (in order) with the same exit counts after a model roundtrip.
    fn preserved(config_toml: &str) -> bool {
        let Ok(before) = toml::from_str::<WorkflowConfig>(config_toml) else {
            return false;
        };
        let Ok(out) = crate::builder_panel::roundtrip(config_toml) else {
            return false;
        };
        let Ok(after) = toml::from_str::<WorkflowConfig>(&out) else {
            return false;
        };
        before.states.len() == after.states.len()
            && before.initial == after.initial
            && before
                .states
                .iter()
                .zip(&after.states)
                .all(|((bn, b), (an, a))| bn == an && b.exits.len() == a.exits.len())
    }

    for preset in crate::presets::presets() {
        check(
            &format!(
                "builder: preset `{}` model<->TOML preserves stages + exits",
                preset.name
            ),
            preserved(preset.config),
        );
    }
}

fn check_context_service(check: &mut dyn FnMut(&str, bool)) {
    use services::{ContextService, Registry};
    use tools::ToolContext;

    let tmp = std::env::temp_dir().join(format!("wh-demo-ctx-{}", std::process::id()));
    let svc = ContextService::new(&tmp);
    svc.clear();

    // Direct API: write then read.
    svc.write("Highest number reached: 1", false).ok();
    check(
        "context: write_context then read_context roundtrips",
        svc.read() == "Highest number reached: 1",
    );

    // Tool path: the service contributes read_context / write_context that
    // actually touch the file (the loop's real mechanism).
    let mut reg = Registry::new();
    reg.register(svc.clone());
    let toolset = pollster::block_on(reg.build_toolset(&ToolContext::new(&tmp)));
    let tool_names: Vec<String> = pollster::block_on(toolset.get_tool_definitions())
        .unwrap_or_default()
        .into_iter()
        .map(|d| d.name)
        .collect();
    check(
        "context: contributes read_context + write_context tools",
        tool_names.iter().any(|n| n == "read_context")
            && tool_names.iter().any(|n| n == "write_context"),
    );

    svc.clear();
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

#[cfg(test)]
mod tests {
    use super::check_all;

    // Keep the offline smoke proof green under CI, not just the manual flag.
    #[test]
    fn all_panels_wired() {
        assert!(check_all());
    }
}
