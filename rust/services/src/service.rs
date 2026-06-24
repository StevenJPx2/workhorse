//! Service contract — capability providers that contribute tools to a run.

use std::sync::Arc;

use tools::{Tool, ToolContext};

/// Tools and capabilities a service contributes to a run.
pub struct Contribution {
    pub tools: Vec<Arc<dyn Tool>>,
}

impl Contribution {
    #[must_use]
    pub fn empty() -> Self {
        Self { tools: Vec::new() }
    }
}

/// A capability provider that contributes tools for a run.
///
/// State lives behind `Arc<Self>` so tools can capture the service
/// and call back into it during execution. `setup` takes `self: Arc<Self>`
/// so a service can hand its own `Arc` to the tool closures it builds.
#[async_trait::async_trait]
pub trait Service: Send + Sync {
    /// Name for diagnostics.
    fn name(&self) -> &'static str;

    /// Contribute tools for a run. Called once per `build_toolset`.
    async fn setup(self: Arc<Self>, ctx: &ToolContext) -> Contribution;

    /// Clean up after a run. Called once when the run ends.
    async fn teardown(&self, ctx: &ToolContext);
}
