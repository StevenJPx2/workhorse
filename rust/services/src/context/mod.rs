//! Context service: a shared `context.md` scratchpad with `read_context` /
//! `write_context` tools, used to carry learnings across loop iterations.

mod service;

pub use service::{CONTEXT_SUBPATH, ContextError, ContextService, context_path};
