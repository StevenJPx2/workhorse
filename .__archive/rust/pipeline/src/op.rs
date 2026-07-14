use std::future::Future;
use std::pin::Pin;

use serde_json::Value;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait ValueOp: Send + Sync {
    fn call(&self, input: Value) -> BoxFuture<'_, Value>;
}

pub struct ClosureOp<F>
where
    F: Fn(Value) -> Pin<Box<dyn Future<Output = Value> + Send>> + Send + Sync,
{
    f: F,
}

impl<F> ClosureOp<F>
where
    F: Fn(Value) -> Pin<Box<dyn Future<Output = Value> + Send>> + Send + Sync,
{
    #[must_use]
    pub fn new(f: F) -> Self {
        Self { f }
    }
}

impl<F> ValueOp for ClosureOp<F>
where
    F: Fn(Value) -> Pin<Box<dyn Future<Output = Value> + Send>> + Send + Sync,
{
    fn call(&self, input: Value) -> BoxFuture<'_, Value> {
        Box::pin((self.f)(input))
    }
}

pub struct ChainOp {
    ops: Vec<Box<dyn ValueOp>>,
}

impl ChainOp {
    #[must_use]
    pub fn new(ops: Vec<Box<dyn ValueOp>>) -> Self {
        Self { ops }
    }
}

impl ValueOp for ChainOp {
    fn call(&self, mut input: Value) -> BoxFuture<'_, Value> {
        Box::pin(async move {
            for op in &self.ops {
                input = op.call(input).await;
            }
            input
        })
    }
}
