//! Run a script's command body through the `Sandbox` boundary.
//!
//! All execution is mediated by `sandbox::Sandbox` — the service never spawns a
//! process directly. The body is handed to `/bin/sh -c` as the sandbox program;
//! the concrete sandbox (`LocalSandbox` in dev, `WasiSandbox`/VM in prod) decides
//! the isolation. Options become env vars (uppercased, `-`→`_`); positionals are
//! injected via a `set -- '…'` prefix so the body sees `$1`, `$2`.

use std::path::Path;
use std::sync::Arc;

use sandbox::{Sandbox, SandboxCommand};
use tools::ToolResult;

use crate::script::invoke::Invocation;

/// Execute `command` under `cwd` with the resolved invocation, via `sandbox`.
pub async fn run_command(
    sandbox: &Arc<dyn Sandbox>,
    command: &str,
    cwd: &Path,
    inv: &Invocation,
) -> ToolResult {
    let set_line = build_set_line(&inv.positional);
    let body = format!("{set_line}\n{command}");

    let mut cmd = SandboxCommand::new("/bin/sh")
        .arg("-c")
        .arg(body)
        .preopen(cwd, "/");
    for (key, value) in &inv.options {
        cmd = cmd.env(env_key(key), value);
    }

    match sandbox.exec(cmd).await {
        Ok(out) if out.exit_code == 0 => ToolResult::ok(out.stdout),
        Ok(out) => ToolResult {
            ok: false,
            output: Some(out.stdout),
            error: Some(if out.stderr.is_empty() {
                format!("Script exited with code {}.", out.exit_code)
            } else {
                out.stderr
            }),
            state: std::collections::HashMap::new(),
        },
        Err(e) => ToolResult::fail(format!("Sandbox execution failed: {e}")),
    }
}

/// `--max-count` → `MAX_COUNT`.
fn env_key(key: &str) -> String {
    key.to_uppercase().replace('-', "_")
}

/// `set -- 'a' 'b'` with single-quote escaping, so the body sees `$1`, `$2`.
fn build_set_line(positional: &[String]) -> String {
    let quoted: Vec<String> = positional
        .iter()
        .map(|v| format!("'{}'", v.replace('\'', r"'\''")))
        .collect();
    format!("set -- {}", quoted.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sandbox::LocalSandbox;
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn inv(positional: Vec<String>, options: HashMap<String, String>) -> Invocation {
        Invocation {
            options,
            positional,
        }
    }

    fn local() -> Arc<dyn Sandbox> {
        Arc::new(LocalSandbox::new())
    }

    #[tokio::test]
    async fn runs_echo_with_positional() {
        let res = run_command(
            &local(),
            "echo \"$1\"",
            &PathBuf::from("/tmp"),
            &inv(vec!["world".into()], HashMap::new()),
        )
        .await;
        assert!(res.ok);
        assert_eq!(res.output.unwrap().trim(), "world");
    }

    #[tokio::test]
    async fn options_become_env_vars() {
        let mut opts = HashMap::new();
        opts.insert("max-count".into(), "5".into());
        let res = run_command(
            &local(),
            "echo \"$MAX_COUNT\"",
            &PathBuf::from("/tmp"),
            &inv(vec![], opts),
        )
        .await;
        assert!(res.ok);
        assert_eq!(res.output.unwrap().trim(), "5");
    }

    #[tokio::test]
    async fn nonzero_exit_is_error() {
        let res = run_command(
            &local(),
            "exit 3",
            &PathBuf::from("/tmp"),
            &inv(vec![], HashMap::new()),
        )
        .await;
        assert!(!res.ok);
        assert!(res.error.unwrap().contains("code 3"));
    }
}
