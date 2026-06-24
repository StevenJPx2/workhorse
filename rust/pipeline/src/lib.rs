pub mod compiler;
mod expr;
mod op;

pub use compiler::{PipelineError, WorkflowProgram, compile_stage};
pub use expr::{Expr, ExprError, parse_expr};
pub use op::{ChainOp, ClosureOp, ValueOp};
