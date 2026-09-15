//! Phase 1 sandbox host.
//!
//! Loads the componentized TypeScript tool, grants it exactly one capability —
//! `read-text`, scoped to a single root directory — and proves the guest can
//! reach the filesystem only through that broker. Path escapes are refused by
//! the host, never by the guest.

use std::path::PathBuf;

use wasmtime::component::{Component, HasSelf, Linker};
use wasmtime::error::Context;
use wasmtime::{Engine, Result, Store};

mod bindings {
    wasmtime::component::bindgen!({
        path: "../wit",
        world: "tool",
    });
}

use bindings::Tool;
use bindings::wrkhse::spike::host_fs;

/// The host's slice of the world: the one root the granted capability may read.
struct HostState {
    root: PathBuf,
}

impl HostState {
    /// Resolve a guest-supplied path against the granted root, refusing
    /// anything that resolves outside it (traversal, symlink escape, absolute
    /// paths pointing elsewhere).
    fn resolve(&self, path: &str) -> Result<PathBuf, String> {
        let resolved = std::fs::canonicalize(self.root.join(path))
            .map_err(|e| format!("cannot resolve {path:?}: {e}"))?;

        if !resolved.starts_with(&self.root) {
            return Err(format!("path {path:?} escapes the granted root"));
        }

        Ok(resolved)
    }
}

impl host_fs::Host for HostState {
    fn read_text(&mut self, path: String) -> Result<String, String> {
        let resolved = self.resolve(&path)?;

        std::fs::read_to_string(&resolved).map_err(|e| format!("read failed: {e}"))
    }
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let root = args.next().context("usage: host <root> <component> <good-path> <escape-path>")?;
    let component_path = args.next().context("missing <component>")?;
    let good_path = args.next().context("missing <good-path>")?;
    let escape_path = args.next().context("missing <escape-path>")?;

    let root = std::fs::canonicalize(&root).context("canonicalize root")?;

    let engine = Engine::default();
    let component = Component::from_file(&engine, &component_path).context("load component")?;

    let mut linker: Linker<HostState> = Linker::new(&engine);
    Tool::add_to_linker::<_, HasSelf<_>>(&mut linker, |state| state).context("wire host import")?;

    let mut store = Store::new(&engine, HostState { root: root.clone() });
    let tool = Tool::instantiate(&mut store, &component, &linker).context("instantiate")?;

    println!("granted root: {}", root.display());

    let ok = tool.call_run(&mut store, &good_path).context("call run")?;
    println!("run({good_path:?}) -> {ok}");

    let denied = tool.call_try_escape(&mut store, &escape_path).context("call try-escape")?;
    println!("try_escape({escape_path:?}) -> {denied}");

    Ok(())
}
