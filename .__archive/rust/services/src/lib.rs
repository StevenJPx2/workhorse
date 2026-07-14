//! Services — capability providers that contribute tools to a run.
//!
//! Houses the `Service`/`Contribution` contract, the `Registry` that builds a
//! fresh rig `ToolSet` per run, and the built-in services (starting with
//! `ScriptService`).

pub mod context;
mod registry;
pub mod script;
mod service;

pub use context::{ContextError, ContextService};
pub use registry::Registry;
pub use script::{ScriptError, ScriptService};
pub use service::{Contribution, Service};
