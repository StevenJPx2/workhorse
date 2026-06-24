//! Registry — collects services and builds a fresh `ToolSet` per run.

use std::sync::Arc;

use tools::{RigToolBridge, ToolContext};

use crate::service::Service;

/// Collects services and builds a fresh `ToolSet` per run.
pub struct Registry {
    services: Vec<Arc<dyn Service>>,
}

impl Registry {
    #[must_use]
    pub fn new() -> Self {
        Self {
            services: Vec::new(),
        }
    }

    /// Register a service. Call before `build_toolset`.
    pub fn register(&mut self, service: Arc<dyn Service>) {
        self.services.push(service);
    }

    /// Run `setup` on every service, bridge contributed tools into a rig `ToolSet`.
    /// Each call returns an independent set — the registry stores services, not tools.
    pub async fn build_toolset(&self, ctx: &ToolContext) -> rig::tool::ToolSet {
        let mut toolset = rig::tool::ToolSet::default();
        for svc in &self.services {
            let contribution = svc.clone().setup(ctx).await;
            for tool in contribution.tools {
                let bridge = RigToolBridge::new(tool, Arc::new(ctx.clone()));
                toolset.add_tool(bridge);
            }
        }
        toolset
    }

    /// Run `teardown` on every service. Call when the run ends.
    pub async fn teardown(&self, ctx: &ToolContext) {
        for svc in &self.services {
            svc.teardown(ctx).await;
        }
    }

    /// Number of registered services.
    #[must_use]
    pub fn len(&self) -> usize {
        self.services.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.services.is_empty()
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::Contribution;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tools::{ToolResult, define_tool};

    #[derive(Default)]
    struct CounterService {
        count: AtomicUsize,
    }

    #[async_trait::async_trait]
    impl Service for CounterService {
        fn name(&self) -> &'static str {
            "counter"
        }

        async fn setup(self: Arc<Self>, _ctx: &ToolContext) -> Contribution {
            self.count.fetch_add(1, Ordering::SeqCst);
            let count = self.count.load(Ordering::SeqCst);
            let tool = define_tool(
                "get_count",
                "Get the setup invocation count",
                move |_args: (), _ctx| async move { Ok(ToolResult::ok(count.to_string())) },
            );
            Contribution { tools: vec![tool] }
        }

        async fn teardown(&self, _ctx: &ToolContext) {}
    }

    #[derive(Default)]
    struct RecordingTeardown {
        called: AtomicUsize,
    }

    #[async_trait::async_trait]
    impl Service for RecordingTeardown {
        fn name(&self) -> &'static str {
            "recording"
        }

        async fn setup(self: Arc<Self>, _ctx: &ToolContext) -> Contribution {
            Contribution::empty()
        }

        async fn teardown(&self, _ctx: &ToolContext) {
            self.called.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn registry_builds_toolset_from_service() {
        let svc = Arc::new(CounterService::default());
        let mut reg = Registry::new();
        reg.register(svc.clone());

        let ctx = ToolContext::new("/tmp/wt");
        let toolset = reg.build_toolset(&ctx).await;

        let defs = toolset.get_tool_definitions().await.unwrap();
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].name, "get_count");

        let result = toolset.call("get_count", "null".to_string()).await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["output"], "1");
    }

    #[tokio::test]
    async fn fresh_set_per_run_independent_state() {
        let svc = Arc::new(CounterService::default());
        let mut reg = Registry::new();
        reg.register(svc.clone());

        let ctx = ToolContext::new("/tmp/wt");
        let ts1 = reg.build_toolset(&ctx).await;
        let ts2 = reg.build_toolset(&ctx).await;

        let r1: serde_json::Value =
            serde_json::from_str(&ts1.call("get_count", "null".to_string()).await.unwrap())
                .unwrap();
        let r2: serde_json::Value =
            serde_json::from_str(&ts2.call("get_count", "null".to_string()).await.unwrap())
                .unwrap();

        assert_eq!(r1["output"], "1");
        assert_eq!(r2["output"], "2");
    }

    #[tokio::test]
    async fn teardown_fires_exactly_once_per_service() {
        let svc = Arc::new(RecordingTeardown::default());
        let mut reg = Registry::new();
        reg.register(svc.clone());

        let ctx = ToolContext::new("/tmp/wt");
        reg.build_toolset(&ctx).await;
        assert_eq!(svc.called.load(Ordering::SeqCst), 0);

        reg.teardown(&ctx).await;
        assert_eq!(svc.called.load(Ordering::SeqCst), 1);

        reg.teardown(&ctx).await;
        assert_eq!(svc.called.load(Ordering::SeqCst), 2);
    }
}
