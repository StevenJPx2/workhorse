//! `LocalSandbox` — dev-only execution that runs the command as a real OS
//! process, scoped to the first preopen's host directory as cwd.
//!
//! This is the weakest boundary (no namespace/VM isolation) and is meant for
//! local development. Production paths use `WasiSandbox` (a `busybox`/`bash`
//! `.wasm` under a WASI preopen) or a VM-backed sandbox. The `Sandbox` trait is
//! the seam, so swapping impls needs no caller change.

use std::process::Command;

use async_trait::async_trait;

use crate::sandbox::{Sandbox, SandboxCommand, SandboxError, SandboxOutput};

/// Runs a `SandboxCommand` as a local process. `program` is the executable
/// (e.g. `/bin/sh`), `args` its arguments (e.g. `["-c", body]`); the working
/// directory is the host path of the first preopen, if any.
#[derive(Debug, Default, Clone)]
pub struct LocalSandbox;

impl LocalSandbox {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Sandbox for LocalSandbox {
    async fn exec(&self, command: SandboxCommand) -> Result<SandboxOutput, SandboxError> {
        // Run inline (no `spawn_blocking`) so this works under both a tokio
        // reactor and a bare `pollster::block_on` (the demo/selfcheck path).
        // Dev-only: the command is short and the block is brief.
        run(&command)
    }
}

fn run(command: &SandboxCommand) -> Result<SandboxOutput, SandboxError> {
    let mut cmd = Command::new(&command.program);
    cmd.args(&command.args);
    for (key, value) in &command.env {
        cmd.env(key, value);
    }
    // Scope execution to the first preopen's host dir (the worktree root).
    if let Some((host_path, _guest)) = command.preopens.first() {
        cmd.current_dir(host_path);
    }

    let output = cmd
        .output()
        .map_err(|e| SandboxError::Exec(format!("spawn {}: {e}", command.program.display())))?;

    Ok(SandboxOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn runs_a_shell_command_in_preopen_cwd() {
        let tmp = tempfile::tempdir().unwrap();
        let cmd = SandboxCommand::new("/bin/sh")
            .arg("-c")
            .arg("pwd")
            .preopen(tmp.path(), "/");
        let out = LocalSandbox::new().exec(cmd).await.unwrap();
        assert_eq!(out.exit_code, 0);
        // macOS /tmp is a symlink to /private/tmp; compare the trailing component.
        let printed = out.stdout.trim();
        assert!(printed.ends_with(tmp.path().file_name().unwrap().to_str().unwrap()));
    }

    #[tokio::test]
    async fn propagates_env_and_exit_code() {
        let cmd = SandboxCommand::new("/bin/sh")
            .arg("-c")
            .arg("echo \"$GREETING\"; exit 7")
            .env("GREETING", "hi");
        let out = LocalSandbox::new().exec(cmd).await.unwrap();
        assert_eq!(out.stdout.trim(), "hi");
        assert_eq!(out.exit_code, 7);
    }
}
