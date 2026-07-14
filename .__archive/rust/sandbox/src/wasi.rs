use std::sync::Arc;

use async_trait::async_trait;
use wasmtime::{Engine, Linker, Module, Store};
use wasmtime_wasi::p1::{self, WasiP1Ctx};
use wasmtime_wasi::p2::pipe::MemoryOutputPipe;
use wasmtime_wasi::{DirPerms, FilePerms, WasiCtxBuilder};

use crate::sandbox::{Sandbox, SandboxCommand, SandboxError, SandboxOutput};

pub struct WasiSandbox {
    engine: Engine,
}

impl WasiSandbox {
    /// Create a sandbox with a default wasmtime engine.
    ///
    /// # Errors
    /// Returns [`SandboxError`] if engine creation fails (currently infallible).
    pub fn new() -> Result<Self, SandboxError> {
        let engine = Engine::default();
        Ok(Self { engine })
    }

    #[must_use]
    pub fn with_engine(engine: Engine) -> Self {
        Self { engine }
    }
}

impl Default for WasiSandbox {
    fn default() -> Self {
        Self::new().expect("engine creation is infallible")
    }
}

fn exec_sync(
    engine: &Engine,
    command: &SandboxCommand,
) -> Result<(String, String, i32), SandboxError> {
    let program_path = &command.program;
    if !program_path.exists() {
        return Err(SandboxError::NotFound(program_path.clone()));
    }

    let module = Module::from_file(engine, program_path)
        .map_err(|e| SandboxError::Compile(e.to_string()))?;

    let stdout_pipe = Arc::new(MemoryOutputPipe::new(1024 * 1024));
    let stderr_pipe = Arc::new(MemoryOutputPipe::new(1024 * 1024));

    let mut builder = WasiCtxBuilder::new();
    builder.stdout(stdout_pipe.clone());
    builder.stderr(stderr_pipe.clone());

    for arg in &command.args {
        builder.arg(arg);
    }

    for (key, value) in &command.env {
        builder.env(key, value);
    }

    for (host_path, guest_path) in &command.preopens {
        builder
            .preopened_dir(host_path, guest_path, DirPerms::all(), FilePerms::all())
            .map_err(|e| SandboxError::Setup(format!("preopen {}: {e}", host_path.display())))?;
    }

    let wasi_ctx = builder.build_p1();

    let mut linker: Linker<WasiP1Ctx> = Linker::new(engine);
    p1::add_to_linker_sync(&mut linker, |ctx| ctx)
        .map_err(|e| SandboxError::Setup(e.to_string()))?;

    let mut store = Store::new(engine, wasi_ctx);

    linker
        .module(&mut store, "", &module)
        .map_err(|e| SandboxError::Exec(e.to_string()))?;

    let exit_code = match linker
        .get_default(&mut store, "")
        .map_err(|e| SandboxError::Exec(e.to_string()))?
        .typed::<(), ()>(&store)
        .map_err(|e| SandboxError::Exec(e.to_string()))?
        .call(&mut store, ())
    {
        Ok(()) => 0,
        Err(_) => 1,
    };

    let stdout = String::from_utf8_lossy(&stdout_pipe.contents()).to_string();
    let stderr = String::from_utf8_lossy(&stderr_pipe.contents()).to_string();

    Ok((stdout, stderr, exit_code))
}

#[async_trait]
impl Sandbox for WasiSandbox {
    async fn exec(&self, command: SandboxCommand) -> Result<SandboxOutput, SandboxError> {
        let engine = self.engine.clone();

        tokio::task::spawn_blocking(move || {
            let (stdout, stderr, exit_code) = exec_sync(&engine, &command)?;
            Ok(SandboxOutput {
                stdout,
                stderr,
                exit_code,
            })
        })
        .await
        .map_err(|e| SandboxError::Exec(e.to_string()))?
    }
}
