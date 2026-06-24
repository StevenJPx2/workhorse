use std::marker::PhantomData;
use std::sync::Arc;

use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::tool::{Tool, ToolContext, ToolError, ToolResult};

struct TypedTool<A, F> {
    name: &'static str,
    description: &'static str,
    schema: Value,
    handler: F,
    _marker: PhantomData<A>,
}

#[async_trait::async_trait]
impl<A, F, Fut> Tool for TypedTool<A, F>
where
    A: JsonSchema + DeserializeOwned + Send + Sync + 'static,
    F: Fn(A, &ToolContext) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<ToolResult, ToolError>> + Send + 'static,
{
    fn name(&self) -> &str {
        self.name
    }

    fn description(&self) -> &str {
        self.description
    }

    fn schema(&self) -> Value {
        self.schema.clone()
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> Result<ToolResult, ToolError> {
        let typed: A =
            serde_json::from_value(args).or_else(|_| serde_json::from_value(Value::Null))?;
        (self.handler)(typed, ctx).await
    }
}

/// Build a typed tool from a name, description, and async handler, erasing it to
/// `Arc<dyn Tool>` for heterogeneous storage and the rig `ToolSet` bridge.
///
/// # Panics
/// Panics if JSON Schema generation for `A` fails, which is infallible for any
/// valid `JsonSchema` type.
#[must_use]
pub fn define_tool<A, F, Fut>(
    name: &'static str,
    description: &'static str,
    handler: F,
) -> Arc<dyn Tool>
where
    A: JsonSchema + DeserializeOwned + Send + Sync + 'static,
    F: Fn(A, &ToolContext) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<ToolResult, ToolError>> + Send + 'static,
{
    let schema = serde_json::to_value(schemars::schema_for!(A))
        .expect("schema generation is infallible for valid types");

    Arc::new(TypedTool {
        name,
        description,
        schema,
        handler,
        _marker: PhantomData,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::sync::Arc as StdArc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(JsonSchema, Deserialize)]
    struct EchoArgs {
        name: String,
    }

    #[tokio::test]
    async fn validates_args_before_execute() {
        let tool = define_tool("echo", "Echo a name", |args: EchoArgs, _ctx| async move {
            Ok(ToolResult::ok(args.name))
        });

        let ctx = ToolContext::new("/tmp/wt");
        let result = tool
            .execute(serde_json::json!({ "name": "ada" }), &ctx)
            .await
            .unwrap();

        assert_eq!(result, ToolResult::ok("ada"));
    }

    #[tokio::test]
    async fn rejects_args_that_do_not_match_input() {
        let tool = define_tool("echo", "Echo a name", |args: EchoArgs, _ctx| async move {
            Ok(ToolResult::ok(args.name))
        });

        let ctx = ToolContext::new("/tmp/wt");
        let result = tool.execute(serde_json::json!({ "name": 42 }), &ctx).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn works_without_args() {
        let tool = define_tool("noop", "Always ok", |_args: (), _ctx| async move {
            Ok(ToolResult {
                ok: true,
                output: None,
                error: None,
            })
        });

        let ctx = ToolContext::new("/tmp/wt");
        let result = tool.execute(Value::Null, &ctx).await.unwrap();

        assert_eq!(
            result,
            ToolResult {
                ok: true,
                output: None,
                error: None
            }
        );
    }

    #[tokio::test]
    async fn handler_calls_back_into_shared_service() {
        struct Counter {
            count: StdArc<AtomicUsize>,
        }

        impl Counter {
            fn new() -> Self {
                Self {
                    count: StdArc::new(AtomicUsize::new(0)),
                }
            }
            fn increment(&self) -> usize {
                self.count.fetch_add(1, Ordering::SeqCst) + 1
            }
        }

        let counter = StdArc::new(Counter::new());
        let counter_clone = counter.clone();

        let tool = define_tool("counter", "Counts calls", move |_args: (), _ctx| {
            let c = counter_clone.clone();
            async move {
                let n = c.increment();
                Ok(ToolResult::ok(format!("count={n}")))
            }
        });

        let ctx = ToolContext::new("/tmp/wt");
        tool.execute(Value::Null, &ctx).await.unwrap();
        tool.execute(Value::Null, &ctx).await.unwrap();

        assert_eq!(counter.count.load(Ordering::SeqCst), 2);
    }
}
