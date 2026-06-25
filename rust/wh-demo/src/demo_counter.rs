//! Demo-only `CounterService`: a deterministic run-scoped counter exposed as an
//! `increment_counter` tool. It is intentionally trivial — a prop for the
//! `ralph-loop` orchestrator demo to show a *tool* doing real, non-prose work
//! (so the model can't fake the count in markdown) and to show per-step tool
//! scoping (granted to `work`, withheld from `memory_weaver`). It lives in the
//! demo, NOT the real `services` crate, because it carries no production value.

use std::sync::{Arc, Mutex};

use services::{Contribution, Service};
use tools::{ToolContext, ToolResult, define_tool};

/// A run-scoped counter. Clones share the same underlying count (it's an `Arc`).
#[derive(Clone, Default)]
pub struct CounterService {
    count: Arc<Mutex<i64>>,
}

impl CounterService {
    /// Increment by one and return the new value.
    fn increment(&self) -> i64 {
        let mut n = self.count.lock().expect("counter mutex");
        *n += 1;
        *n
    }
}

#[async_trait::async_trait]
impl Service for CounterService {
    fn name(&self) -> &'static str {
        "counter"
    }

    async fn setup(self: Arc<Self>, _ctx: &ToolContext) -> Contribution {
        let svc = self.clone();
        let increment = define_tool(
            "increment_counter",
            "Increment the run counter by one and return the new value. Call this \
             to advance progress; the returned number is authoritative.",
            move |_args: (), _ctx: &ToolContext| {
                let svc = svc.clone();
                async move {
                    let n = svc.increment();
                    // Publish the count into deterministic run state so workflow
                    // guards (e.g. `count >= 3`) route on the real value — the
                    // agent never sets this.
                    Ok(ToolResult::ok(n.to_string()).with_state("count", serde_json::json!(n)))
                }
            },
        )
        // The tool OWNS `count`: it declares the key it controls + its initial
        // value, so the system auto-seeds it and validates guards against it.
        .produces("count", serde_json::json!(0))
        .build();
        Contribution {
            tools: vec![increment],
        }
    }

    async fn teardown(&self, _ctx: &ToolContext) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increment_returns_successive_values_and_clones_share() {
        let a = CounterService::default();
        let b = a.clone();
        assert_eq!(a.increment(), 1);
        assert_eq!(b.increment(), 2);
    }
}
