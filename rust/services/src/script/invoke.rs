//! Resolve raw invocation against a script's declared args, and render help.
//!
//! Ported from `packages/core-v2/src/schema/script/{invoke,help}.ts`.

use std::collections::HashMap;

use crate::script::front_matter::Script;

/// An error resolving a raw invocation against a script's declared args.
#[derive(Debug, thiserror::Error)]
pub enum InvocationError {
    /// An option was supplied that the script does not declare.
    #[error("unknown option: {0}")]
    UnknownOption(String),
    /// A required option was not supplied and has no default.
    #[error("missing required option: {0}")]
    MissingOption(String),
    /// A required positional argument was not supplied and has no default.
    #[error("missing required argument: {0}")]
    MissingArgument(String),
}

/// Resolved invocation: options as env-ready map + positional values by index.
pub struct Invocation {
    pub options: HashMap<String, String>,
    pub positional: Vec<String>,
}

/// Resolve raw `options`/`positional` against the script's declared args.
///
/// # Errors
/// Returns [`InvocationError`] on an unknown option, a missing required option,
/// or a missing required positional argument.
pub fn resolve_invocation(
    script: &Script,
    options: &HashMap<String, String>,
    positional: &[String],
) -> Result<Invocation, InvocationError> {
    // Reject unknown options.
    for key in options.keys() {
        if !script.args.options.iter().any(|o| &o.name == key) {
            return Err(InvocationError::UnknownOption(key.clone()));
        }
    }

    let mut resolved_opts = HashMap::new();
    for spec in &script.args.options {
        if let Some(v) = options.get(&spec.name) {
            resolved_opts.insert(spec.name.clone(), v.clone());
        } else if let Some(d) = &spec.default {
            resolved_opts.insert(spec.name.clone(), d.clone());
        } else if spec.required == Some(true) {
            return Err(InvocationError::MissingOption(spec.name.clone()));
        }
    }

    let mut resolved_pos = Vec::new();
    for (i, spec) in script.args.positional.iter().enumerate() {
        if let Some(v) = positional.get(i) {
            resolved_pos.push(v.clone());
        } else if let Some(d) = &spec.default {
            resolved_pos.push(d.clone());
        } else if spec.required == Some(true) {
            return Err(InvocationError::MissingArgument(spec.name.clone()));
        } else {
            resolved_pos.push(String::new());
        }
    }

    Ok(Invocation {
        options: resolved_opts,
        positional: resolved_pos,
    })
}

/// Render a usage string for a script (the `help: true` path).
#[must_use]
pub fn render_help(script: &Script) -> String {
    let mut usage = format!("Usage: {}", script.name);
    for p in &script.args.positional {
        usage.push(' ');
        if p.required == Some(true) {
            usage.push('<');
            usage.push_str(&p.name);
            usage.push('>');
        } else {
            usage.push('[');
            usage.push_str(&p.name);
            usage.push(']');
        }
    }
    if !script.args.options.is_empty() {
        usage.push_str(" [options]");
    }

    let mut out = vec![usage, String::new(), script.description.clone()];

    if !script.args.positional.is_empty() {
        out.push(String::new());
        out.push(format!("Arguments: [{}]", script.args.positional.len()));
        for p in &script.args.positional {
            out.push(format!(
                "  {}{} — {}",
                p.name,
                meta_suffix(p.required, p.default.as_deref()),
                p.description
            ));
        }
    }

    if !script.args.options.is_empty() {
        out.push(String::new());
        out.push(format!("Options: [{}]", script.args.options.len()));
        for o in &script.args.options {
            let alias = o
                .alias
                .as_ref()
                .map(|a| format!(", -{a}"))
                .unwrap_or_default();
            out.push(format!(
                "  --{}{}{} — {}",
                o.name,
                alias,
                meta_suffix(o.required, o.default.as_deref()),
                o.description
            ));
        }
    }

    out.join("\n")
}

fn meta_suffix(required: Option<bool>, default: Option<&str>) -> String {
    let mut parts = Vec::new();
    if required == Some(true) {
        parts.push("required".to_string());
    }
    if let Some(d) = default {
        parts.push(format!("default: {d}"));
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(" ({})", parts.join(", "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::front_matter::{ArgSpec, ScriptArgs};

    fn script_with(positional: Vec<ArgSpec>) -> Script {
        Script {
            name: "s".into(),
            description: "desc".into(),
            args: ScriptArgs {
                options: vec![],
                positional,
            },
            command: String::new(),
        }
    }

    #[test]
    fn missing_required_positional_errors() {
        let s = script_with(vec![ArgSpec {
            name: "who".into(),
            required: Some(true),
            ..Default::default()
        }]);
        assert!(resolve_invocation(&s, &HashMap::new(), &[]).is_err());
    }

    #[test]
    fn optional_positional_defaults_empty() {
        let s = script_with(vec![ArgSpec {
            name: "who".into(),
            ..Default::default()
        }]);
        let inv = resolve_invocation(&s, &HashMap::new(), &[]).unwrap();
        assert_eq!(inv.positional, vec![String::new()]);
    }

    #[test]
    fn unknown_option_errors() {
        let s = script_with(vec![]);
        let mut opts = HashMap::new();
        opts.insert("bogus".into(), "x".into());
        assert!(resolve_invocation(&s, &opts, &[]).is_err());
    }
}
