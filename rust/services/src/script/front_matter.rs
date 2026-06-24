//! Script types + front-matter (de)serialization.
//!
//! A script is a `.sh` file whose YAML metadata lives as `#`-prefixed shell
//! comments at the top, followed by the raw command body. Ported from
//! `packages/core-v2/src/schema/script/`.

use serde::{Deserialize, Serialize};

/// A positional argument spec.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ArgSpec {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
}

/// A named option spec (an `ArgSpec` plus an optional short alias).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OptionSpec {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

/// Declared CLI contract for a script.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScriptArgs {
    #[serde(default)]
    pub options: Vec<OptionSpec>,
    #[serde(default)]
    pub positional: Vec<ArgSpec>,
}

/// A discovered or authored script: metadata + the raw shell command body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub args: ScriptArgs,
    /// The full raw `.sh` body (front-matter comments included).
    pub command: String,
}

/// The YAML front-matter payload (no `command` — that's the body).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct FrontMatter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    args: Option<ScriptArgs>,
}

/// Parse a `.sh` file body into metadata + command.
///
/// Drops a leading `#!` shebang, strips a leading `# ` from every line, runs
/// the result as YAML front-matter. The entire raw input is retained as
/// `command`. On any parse failure, returns empty args + the raw body.
#[must_use]
pub fn parse_front_matter(raw: &str, fallback_name: &str) -> Script {
    let lines: Vec<&str> = raw.split('\n').collect();
    let skip = usize::from(lines.first().is_some_and(|l| l.starts_with("#!")));
    let stripped: String = lines[skip..]
        .iter()
        .map(|line| strip_comment_prefix(line))
        .collect::<Vec<_>>()
        .join("\n");

    let fm = extract_yaml_block(&stripped)
        .and_then(|yaml| serde_yaml_ng::from_str::<FrontMatter>(&yaml).ok())
        .unwrap_or_default();

    Script {
        name: fallback_name.to_string(),
        description: fm
            .description
            .unwrap_or_else(|| format!("Script: {fallback_name}")),
        args: fm.args.unwrap_or_default(),
        command: raw.to_string(),
    }
}

/// Serialize a script's metadata as a `#`-commented YAML block, then append
/// the raw command body. Round-trips with [`parse_front_matter`].
#[must_use]
pub fn serialize_front_matter(script: &Script) -> String {
    let fm = FrontMatter {
        description: Some(script.description.clone()),
        args: if script.args.options.is_empty() && script.args.positional.is_empty() {
            None
        } else {
            Some(script.args.clone())
        },
    };
    let yaml = serde_yaml_ng::to_string(&fm).unwrap_or_default();
    let commented: String = yaml
        .trim_end()
        .split('\n')
        .map(|line| format!("# {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("# ---\n{commented}\n# ---\n{}", script.command.trim_end())
}

fn strip_comment_prefix(line: &str) -> &str {
    line.strip_prefix("# ")
        .or_else(|| line.strip_prefix('#'))
        .unwrap_or(line)
}

/// Pull the YAML between the first pair of `---` fences, if present.
fn extract_yaml_block(stripped: &str) -> Option<String> {
    let mut lines = stripped.lines();
    let first = lines.next()?.trim();
    if first != "---" {
        return None;
    }
    let mut body = Vec::new();
    for line in lines {
        if line.trim() == "---" {
            return Some(body.join("\n"));
        }
        body.push(line);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_front_matter() {
        let script = Script {
            name: "greet".into(),
            description: "Greet a user".into(),
            args: ScriptArgs {
                positional: vec![ArgSpec {
                    name: "who".into(),
                    description: "who to greet".into(),
                    required: Some(true),
                    ..Default::default()
                }],
                options: vec![],
            },
            command: "echo \"hello $1\"".into(),
        };
        let serialized = serialize_front_matter(&script);
        assert!(serialized.contains("# description: Greet a user"));
        assert!(serialized.contains("echo \"hello $1\""));

        let parsed = parse_front_matter(&serialized, "greet");
        assert_eq!(parsed.description, "Greet a user");
        assert_eq!(parsed.args.positional.len(), 1);
        assert_eq!(parsed.args.positional[0].name, "who");
    }

    #[test]
    fn parse_failure_keeps_raw_command() {
        let raw = "echo hi\nls -la";
        let parsed = parse_front_matter(raw, "noop");
        assert_eq!(parsed.command, raw);
        assert_eq!(parsed.description, "Script: noop");
        assert!(parsed.args.positional.is_empty());
    }

    #[test]
    fn skips_shebang_line() {
        let raw = "#!/bin/sh\n# ---\n# description: with shebang\n# ---\necho hi";
        let parsed = parse_front_matter(raw, "x");
        assert_eq!(parsed.description, "with shebang");
    }
}
