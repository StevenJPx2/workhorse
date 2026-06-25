use std::fmt::Write as _;

use pipeline::compiler::StepConfig;
use rig::completion::{Message, ToolDefinition};

/// Assemble a step's request messages. The prologue frames the role; an optional
/// tools block lists the capabilities the step's services contributed; the
/// epilogue states what to produce — all three as system framing. The user turn
/// carries any inbound transition handoff ahead of the task and is last, so it is
/// the prompt the model answers. Empty parts are skipped.
#[must_use]
pub fn assemble_request(
    step: &StepConfig,
    task: &str,
    handoff: Option<&str>,
    tools: &[ToolDefinition],
) -> Vec<Message> {
    let mut messages = Vec::new();

    if let Some(prologue) = step.prologue.as_deref().filter(|s| !s.is_empty()) {
        messages.push(Message::system(prologue));
    }

    if let Some(blurb) = render_tools(tools) {
        messages.push(Message::system(blurb));
    }

    if let Some(epilogue) = step.epilogue.as_deref().filter(|s| !s.is_empty()) {
        messages.push(Message::system(epilogue));
    }

    let user = match handoff.filter(|h| !h.is_empty()) {
        Some(h) => format!("{h}\n\n{task}"),
        None => task.to_string(),
    };
    messages.push(Message::user(user));

    messages
}

/// Render the available tools as a system blurb so the model sees its
/// capabilities in the prompt (in addition to the provider's native tool field).
/// Returns `None` when no tools are available, so no empty block is emitted.
fn render_tools(tools: &[ToolDefinition]) -> Option<String> {
    if tools.is_empty() {
        return None;
    }
    let mut blurb = String::from("You have access to these tools:\n");
    for tool in tools {
        let _ = writeln!(blurb, "- {}: {}", tool.name, tool.description);
    }
    blurb.push_str("Call a tool when it helps complete the task.");
    Some(blurb)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(prologue: Option<&str>, epilogue: Option<&str>) -> StepConfig {
        StepConfig {
            prologue: prologue.map(str::to_string),
            epilogue: epilogue.map(str::to_string),
            ..Default::default()
        }
    }

    fn text(msg: &Message) -> String {
        serde_json::to_value(msg).unwrap().to_string()
    }

    fn tool_def(name: &str, description: &str) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: description.to_string(),
            parameters: serde_json::json!({}),
        }
    }

    #[test]
    fn full_step_frames_then_prompts() {
        let s = step(Some("You are a planner."), Some("Output the plan."));
        let msgs = assemble_request(&s, "Break down the issue.", None, &[]);

        assert_eq!(msgs.len(), 3);
        assert!(matches!(msgs[0], Message::System { .. }));
        assert!(matches!(msgs[1], Message::System { .. }));
        assert!(matches!(msgs[2], Message::User { .. }));
        assert!(text(&msgs[0]).contains("You are a planner."));
        assert!(text(&msgs[1]).contains("Output the plan."));
        assert!(text(&msgs[2]).contains("Break down the issue."));
    }

    #[test]
    fn empty_parts_are_skipped() {
        let s = step(None, None);
        let msgs = assemble_request(&s, "just the task", None, &[]);

        assert_eq!(msgs.len(), 1);
        assert!(matches!(msgs[0], Message::User { .. }));
    }

    #[test]
    fn handoff_folds_into_user_turn_before_task() {
        let s = step(Some("Role."), None);
        let msgs = assemble_request(&s, "the task", Some("handoff from previous stage"), &[]);

        let user = text(msgs.last().unwrap());
        let h_pos = user.find("handoff from previous stage").unwrap();
        let t_pos = user.find("the task").unwrap();
        assert!(h_pos < t_pos, "handoff must precede the task");
    }

    #[test]
    fn user_turn_is_always_last() {
        let s = step(Some("p"), Some("e"));
        let msgs = assemble_request(&s, "t", Some("h"), &[]);
        assert!(matches!(msgs.last().unwrap(), Message::User { .. }));
    }

    #[test]
    fn tools_are_listed_as_a_system_block() {
        let s = step(Some("Role."), None);
        let tools = [tool_def("run_script", "Run a saved shell script")];
        let msgs = assemble_request(&s, "the task", None, &tools);

        // prologue, tools, user
        assert_eq!(msgs.len(), 3);
        let tools_block = text(&msgs[1]);
        assert!(tools_block.contains("run_script"));
        assert!(tools_block.contains("Run a saved shell script"));
    }

    #[test]
    fn no_tools_emits_no_block() {
        let s = step(Some("Role."), None);
        let msgs = assemble_request(&s, "the task", None, &[]);
        // prologue, user — no tools block
        assert_eq!(msgs.len(), 2);
    }
}
