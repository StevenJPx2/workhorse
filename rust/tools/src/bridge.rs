use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde_json::Value;

use crate::tool::{Tool, ToolContext};

type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub struct RigToolBridge {
    tool: Arc<dyn Tool>,
    ctx: Arc<ToolContext>,
}

impl RigToolBridge {
    pub fn new(tool: Arc<dyn Tool>, ctx: Arc<ToolContext>) -> Self {
        Self { tool, ctx }
    }
}

impl rig::tool::ToolDyn for RigToolBridge {
    fn name(&self) -> String {
        self.tool.name().to_string()
    }

    fn definition(&self, _prompt: String) -> BoxFuture<'_, rig::completion::ToolDefinition> {
        Box::pin(async move {
            rig::completion::ToolDefinition {
                name: self.tool.name().to_string(),
                description: self.tool.description().to_string(),
                parameters: self.tool.schema(),
            }
        })
    }

    fn call(&self, args: String) -> BoxFuture<'_, Result<String, rig::tool::ToolError>> {
        Box::pin(async move {
            let args: Value = if args.trim() == "null" || args.trim() == "\"\"" {
                Value::Null
            } else {
                serde_json::from_str(&args).map_err(rig::tool::ToolError::JsonError)?
            };

            let result = self
                .tool
                .execute(args, &self.ctx)
                .await
                .map_err(|e| rig::tool::ToolError::ToolCallError(Box::new(e)))?;

            serde_json::to_string(&result).map_err(rig::tool::ToolError::JsonError)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::define_tool;
    use schemars::JsonSchema;
    use serde::Deserialize;

    #[derive(JsonSchema, Deserialize)]
    struct GreetArgs {
        name: String,
    }

    #[tokio::test]
    async fn bridge_registers_and_dispatches_via_toolset() {
        let tool = define_tool(
            "greet",
            "Greet someone",
            |args: GreetArgs, _ctx| async move {
                Ok(crate::ToolResult::ok(format!("hello {}", args.name)))
            },
        );

        let ctx = Arc::new(ToolContext::new("/tmp/wt"));
        let bridge = RigToolBridge::new(tool, ctx);

        let mut toolset = rig::tool::ToolSet::builder().build();
        toolset.add_tool(bridge);

        let defs = toolset.get_tool_definitions().await.unwrap();
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].name, "greet");

        let result = toolset
            .call("greet", r#"{"name":"ada"}"#.to_string())
            .await
            .unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["output"], "hello ada");
    }

    #[tokio::test]
    async fn bridge_handles_null_args_for_unit_tools() {
        let tool = define_tool("ping", "Always pong", |_args: (), _ctx| async move {
            Ok(crate::ToolResult::ok("pong"))
        });

        let ctx = Arc::new(ToolContext::new("/tmp/wt"));
        let bridge = RigToolBridge::new(tool, ctx);

        let mut toolset = rig::tool::ToolSet::builder().build();
        toolset.add_tool(bridge);

        let result = toolset.call("ping", "null".to_string()).await.unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["output"], "pong");
    }
}
