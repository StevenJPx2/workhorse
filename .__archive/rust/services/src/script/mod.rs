//! Script service: discover, write, and run reusable `.sh` scripts.

mod discover;
mod front_matter;
mod invoke;
mod run;
mod service;

pub use front_matter::{ArgSpec, OptionSpec, Script, ScriptArgs};
pub use invoke::InvocationError;
pub use service::{ScriptError, ScriptService};
