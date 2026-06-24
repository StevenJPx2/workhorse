use std::path::PathBuf;
use std::process::Command;

use sandbox::{Sandbox, SandboxCommand, WasiSandbox};
use tempfile::TempDir;

fn build_wasm_probe() -> PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let workspace_root = PathBuf::from(manifest_dir).parent().unwrap().to_path_buf();

    let wasm_path = workspace_root.join("target/wasm32-wasip1/debug/wasm-probe.wasm");

    if !wasm_path.exists() {
        let output = Command::new("cargo")
            .args(["build", "-p", "wasm-probe", "--target", "wasm32-wasip1"])
            .current_dir(&workspace_root)
            .output()
            .expect("failed to run cargo build");

        assert!(
            output.status.success(),
            "cargo build failed:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    assert!(
        wasm_path.exists(),
        "wasm binary not found at {}",
        wasm_path.display()
    );
    wasm_path
}

#[tokio::test]
async fn wasm_probe_runs_inside_sandbox() {
    let wasm = build_wasm_probe();
    let sandbox = WasiSandbox::new().unwrap();

    let tmp = TempDir::new().unwrap();
    std::fs::write(tmp.path().join("data.txt"), "sandbox-data").unwrap();

    let cmd = SandboxCommand::new(&wasm)
        .arg("first")
        .arg("second")
        .preopen(tmp.path(), "/sandbox");

    let output = sandbox.exec(cmd).await.unwrap();

    println!("stdout: {}", output.stdout);
    println!("stderr: {}", output.stderr);

    assert!(output.stdout.contains("hello from sandbox"));
    assert!(output.stdout.contains("arg: first"));
    assert!(output.stdout.contains("arg: second"));
    assert!(output.stdout.contains("read: sandbox-data"));
}

#[tokio::test]
async fn sandbox_denies_access_outside_preopen() {
    let wasm = build_wasm_probe();
    let sandbox = WasiSandbox::new().unwrap();

    let tmp = TempDir::new().unwrap();
    std::fs::write(tmp.path().join("data.txt"), "ok").unwrap();

    let cmd = SandboxCommand::new(&wasm).preopen(tmp.path(), "/sandbox");

    let output = sandbox.exec(cmd).await.unwrap();

    println!("stdout: {}", output.stdout);

    assert!(output.stdout.contains("denied: /etc/passwd"));
    assert!(!output.stdout.contains("LEAK"));
}

#[tokio::test]
async fn sandbox_can_write_inside_preopen() {
    let wasm = build_wasm_probe();
    let sandbox = WasiSandbox::new().unwrap();

    let tmp = TempDir::new().unwrap();
    std::fs::write(tmp.path().join("data.txt"), "ok").unwrap();

    let cmd = SandboxCommand::new(&wasm).preopen(tmp.path(), "/sandbox");

    let output = sandbox.exec(cmd).await.unwrap();

    assert!(output.stdout.contains("wrote: /sandbox/out.txt"));
    assert!(tmp.path().join("out.txt").exists());
    assert_eq!(
        std::fs::read_to_string(tmp.path().join("out.txt")).unwrap(),
        "written from sandbox"
    );
}
