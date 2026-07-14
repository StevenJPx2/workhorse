use std::collections::HashMap;

use serde::{Deserialize, Serialize};

mod parse;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Expr {
    StateKey {
        key: String,
    },
    Builtin {
        name: String,
    },
    Comparison {
        op: CmpOp,
        left: Box<Expr>,
        right: CompareValue,
    },
    FileExists {
        path: String,
    },
    Matches {
        target: Box<Expr>,
        pattern: String,
    },
    And {
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Or {
        left: Box<Expr>,
        right: Box<Expr>,
    },
    Not {
        inner: Box<Expr>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CmpOp {
    Eq,
    Ne,
    Gt,
    Lt,
    Ge,
    Le,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum CompareValue {
    Str(String),
    Num(f64),
    Bool(bool),
    StateKey(String),
}

impl CompareValue {
    fn resolve(&self, state: &HashMap<String, serde_json::Value>) -> serde_json::Value {
        match self {
            CompareValue::Str(s) => serde_json::Value::String(s.clone()),
            CompareValue::Num(n) => serde_json::json!(*n),
            CompareValue::Bool(b) => serde_json::Value::Bool(*b),
            CompareValue::StateKey(k) => state.get(k).cloned().unwrap_or(serde_json::Value::Null),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ExprError {
    #[error("unknown state key: {0}")]
    UnknownKey(String),
    #[error("unknown builtin: {0}")]
    UnknownBuiltin(String),
    #[error("type mismatch in comparison: {0}")]
    TypeMismatch(String),
    #[error("parse error: {0}")]
    Parse(String),
}

impl Expr {
    /// Evaluate this guard against the live state map.
    ///
    /// # Errors
    /// Returns [`ExprError`] for an unknown state key or builtin, a type
    /// mismatch in a comparison, or an invalid regex in a `matches`.
    pub fn evaluate(&self, state: &HashMap<String, serde_json::Value>) -> Result<bool, ExprError> {
        match self {
            Expr::StateKey { key } => {
                let val = state
                    .get(key)
                    .ok_or_else(|| ExprError::UnknownKey(key.clone()))?;
                Ok(is_truthy(val))
            }

            Expr::Builtin { name } => match name.as_str() {
                // `paused` is the unconditional fallback edge: it holds when no
                // real guard fired, so the stage never dead-stops. `never` is its
                // opposite.
                "paused" => Ok(true),
                "never" => Ok(false),
                _ => Err(ExprError::UnknownBuiltin(name.clone())),
            },

            Expr::Comparison { op, left, right } => {
                let left_val = eval_to_value(left, state)?;
                let right_val = right.resolve(state);
                Ok(compare(op, &left_val, &right_val)?)
            }

            Expr::FileExists { path } => Ok(std::path::Path::new(path).exists()),

            Expr::Matches { target, pattern } => {
                let val = eval_to_value(target, state)?;
                let s = val.as_str().ok_or_else(|| {
                    ExprError::TypeMismatch("matches requires string target".into())
                })?;
                let re = regex::Regex::new(pattern)
                    .map_err(|e| ExprError::Parse(format!("bad regex: {e}")))?;
                Ok(re.is_match(s))
            }

            Expr::And { left, right } => Ok(left.evaluate(state)? && right.evaluate(state)?),

            Expr::Or { left, right } => Ok(left.evaluate(state)? || right.evaluate(state)?),

            Expr::Not { inner } => Ok(!inner.evaluate(state)?),
        }
    }

    /// Whether this guard is an unconditional fallback (`builtin::paused` /
    /// `builtin::never`) rather than a "real" condition over state/files. The
    /// harness uses this to decide mid-run boundaries: only real guards end the
    /// agent's work the moment they hold; fallbacks apply only at natural Done.
    #[must_use]
    pub fn is_fallback(&self) -> bool {
        matches!(self, Expr::Builtin { .. })
    }

    /// The state keys this expression reads, for surfacing required inputs.
    #[must_use]
    pub fn known_keys(&self) -> Vec<String> {
        match self {
            Expr::StateKey { key } => vec![key.clone()],
            Expr::Builtin { .. } | Expr::FileExists { .. } => vec![],
            Expr::Comparison { left, .. } => left.known_keys(),
            Expr::Matches { target, .. } => target.known_keys(),
            Expr::And { left, right } | Expr::Or { left, right } => {
                let mut k = left.known_keys();
                k.extend(right.known_keys());
                k
            }
            Expr::Not { inner } => inner.known_keys(),
        }
    }
}

fn eval_to_value(
    expr: &Expr,
    state: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value, ExprError> {
    if let Expr::StateKey { key } = expr {
        state
            .get(key)
            .cloned()
            .ok_or_else(|| ExprError::UnknownKey(key.clone()))
    } else {
        Ok(serde_json::Value::Bool(expr.evaluate(state)?))
    }
}

fn is_truthy(val: &serde_json::Value) -> bool {
    match val {
        serde_json::Value::Null => false,
        serde_json::Value::Bool(b) => *b,
        serde_json::Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        serde_json::Value::String(s) => !s.is_empty(),
        serde_json::Value::Array(a) => !a.is_empty(),
        serde_json::Value::Object(o) => !o.is_empty(),
    }
}

fn compare(
    op: &CmpOp,
    left: &serde_json::Value,
    right: &serde_json::Value,
) -> Result<bool, ExprError> {
    match op {
        // Numbers from the parser are always f64, but state values may be ints.
        // Compare numerically when both sides are numbers so `count == 0` holds
        // whether state stored 0 (int) or 0.0 (float); fall back to structural
        // equality for strings/bools/null.
        CmpOp::Eq | CmpOp::Ne => {
            let eq = match (left.as_f64(), right.as_f64()) {
                // Exact equality is intended: `when` guards compare discrete
                // config/state values, not computed floats.
                #[allow(clippy::float_cmp)]
                (Some(l), Some(r)) => l == r,
                _ => left == right,
            };
            Ok(matches!(op, CmpOp::Eq) == eq)
        }
        CmpOp::Gt | CmpOp::Lt | CmpOp::Ge | CmpOp::Le => {
            let l = left
                .as_f64()
                .ok_or_else(|| ExprError::TypeMismatch(format!("expected number, got {left}")))?;
            let r = right
                .as_f64()
                .ok_or_else(|| ExprError::TypeMismatch(format!("expected number, got {right}")))?;
            Ok(match op {
                CmpOp::Gt => l > r,
                CmpOp::Lt => l < r,
                CmpOp::Ge => l >= r,
                CmpOp::Le => l <= r,
                _ => unreachable!(),
            })
        }
    }
}

pub use parse::parse as parse_expr;
