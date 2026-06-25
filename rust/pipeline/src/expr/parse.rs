use super::{CmpOp, CompareValue, Expr, ExprError};

/// Parse a `when` guard string into an [`Expr`] AST.
///
/// # Errors
/// Returns [`ExprError::Parse`] on malformed syntax or unexpected trailing input.
pub fn parse(input: &str) -> Result<Expr, ExprError> {
    let mut parser = Parser::new(input);
    let expr = parser.parse_or()?;
    parser.skip_ws();
    if !parser.is_eof() {
        return Err(ExprError::Parse(format!(
            "unexpected trailing input: {}",
            parser.remaining()
        )));
    }
    Ok(expr)
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, pos: 0 }
    }

    fn remaining(&self) -> &str {
        &self.input[self.pos..]
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    fn skip_ws(&mut self) {
        while self.pos < self.input.len() && self.input.as_bytes()[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    fn peek(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn try_consume(&mut self, s: &str) -> bool {
        self.skip_ws();
        if self.remaining().starts_with(s) {
            self.pos += s.len();
            true
        } else {
            false
        }
    }

    fn try_consume_any(&mut self, candidates: &[&str]) -> Option<String> {
        self.skip_ws();
        for c in candidates {
            if self.remaining().starts_with(c) {
                self.pos += c.len();
                return Some(c.to_string());
            }
        }
        None
    }

    fn parse_or(&mut self) -> Result<Expr, ExprError> {
        let mut left = self.parse_and()?;
        loop {
            if self.try_consume("or") || self.try_consume("||") {
                let right = self.parse_and()?;
                left = Expr::Or {
                    left: Box::new(left),
                    right: Box::new(right),
                };
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, ExprError> {
        let mut left = self.parse_not()?;
        loop {
            if self.try_consume("and") || self.try_consume("&&") {
                let right = self.parse_not()?;
                left = Expr::And {
                    left: Box::new(left),
                    right: Box::new(right),
                };
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_not(&mut self) -> Result<Expr, ExprError> {
        self.skip_ws();
        if self.try_consume("not") || self.try_consume("!") {
            let inner = self.parse_not()?;
            return Ok(Expr::Not {
                inner: Box::new(inner),
            });
        }
        self.parse_comparison()
    }

    fn parse_comparison(&mut self) -> Result<Expr, ExprError> {
        let left = self.parse_primary()?;

        let op = self.try_consume_any(&["==", "!=", ">=", "<=", ">", "<"]);

        if let Some(op_str) = op {
            let right = self.parse_compare_value()?;
            let op = match op_str.as_str() {
                "==" => CmpOp::Eq,
                "!=" => CmpOp::Ne,
                ">" => CmpOp::Gt,
                "<" => CmpOp::Lt,
                ">=" => CmpOp::Ge,
                "<=" => CmpOp::Le,
                _ => unreachable!(),
            };
            Ok(Expr::Comparison {
                op,
                left: Box::new(left),
                right,
            })
        } else {
            Ok(left)
        }
    }

    fn parse_primary(&mut self) -> Result<Expr, ExprError> {
        self.skip_ws();

        if self.try_consume("(") {
            let expr = self.parse_or()?;
            self.skip_ws();
            if !self.try_consume(")") {
                return Err(ExprError::Parse("expected )".into()));
            }
            return Ok(expr);
        }

        if self.remaining().starts_with("file_exists(") {
            self.pos += "file_exists(".len();
            self.skip_ws();
            let path = self.parse_string()?;
            self.skip_ws();
            if !self.try_consume(")") {
                return Err(ExprError::Parse("expected ) after file_exists path".into()));
            }
            return Ok(Expr::FileExists { path });
        }

        if self.remaining().starts_with("matches(") {
            self.pos += "matches(".len();
            self.skip_ws();
            let target = self.parse_primary()?;
            self.skip_ws();
            if !self.try_consume(",") {
                return Err(ExprError::Parse("expected , in matches()".into()));
            }
            self.skip_ws();
            let pattern = self.parse_string()?;
            self.skip_ws();
            if !self.try_consume(")") {
                return Err(ExprError::Parse("expected ) after matches()".into()));
            }
            return Ok(Expr::Matches {
                target: Box::new(target),
                pattern,
            });
        }

        if self.remaining().starts_with("builtin::") {
            self.pos += "builtin::".len();
            let name = self.parse_identifier()?;
            return Ok(Expr::Builtin { name });
        }

        let ident = self.parse_identifier()?;
        Ok(Expr::StateKey { key: ident })
    }

    fn parse_compare_value(&mut self) -> Result<CompareValue, ExprError> {
        self.skip_ws();

        if let Some(c) = self.peek() {
            if c == '"' || c == '\'' {
                let s = self.parse_string()?;
                return Ok(CompareValue::Str(s));
            }
            if c.is_ascii_digit() || c == '-' {
                let n = self.parse_number()?;
                return Ok(CompareValue::Num(n));
            }
            if self.remaining().starts_with("true") {
                self.pos += 4;
                return Ok(CompareValue::Bool(true));
            }
            if self.remaining().starts_with("false") {
                self.pos += 5;
                return Ok(CompareValue::Bool(false));
            }
        }

        let ident = self.parse_identifier()?;
        Ok(CompareValue::StateKey(ident))
    }

    fn parse_identifier(&mut self) -> Result<String, ExprError> {
        self.skip_ws();
        let start = self.pos;
        if let Some(c) = self.peek()
            && !c.is_ascii_alphabetic()
            && c != '_'
        {
            return Err(ExprError::Parse(format!("expected identifier, got {c}")));
        }
        while self.pos < self.input.len() {
            let c = self.input.as_bytes()[self.pos];
            // `@` is allowed inside an identifier (after the first char) so a
            // stage-relative state key like `count@entry` parses as one key.
            if c.is_ascii_alphanumeric() || c == b'_' || c == b'@' {
                self.pos += 1;
            } else {
                break;
            }
        }
        if self.pos == start {
            return Err(ExprError::Parse("expected identifier".into()));
        }
        Ok(self.input[start..self.pos].to_string())
    }

    fn parse_string(&mut self) -> Result<String, ExprError> {
        self.skip_ws();
        let quote = self
            .peek()
            .ok_or(ExprError::Parse("expected string".into()))?;
        if quote != '"' && quote != '\'' {
            return Err(ExprError::Parse(format!("expected quote, got {quote}")));
        }
        self.pos += 1;
        let start = self.pos;
        while self.pos < self.input.len() {
            let c = self.input.as_bytes()[self.pos];
            if c as char == quote {
                let s = self.input[start..self.pos].to_string();
                self.pos += 1;
                return Ok(s);
            }
            self.pos += 1;
        }
        Err(ExprError::Parse("unterminated string".into()))
    }

    fn parse_number(&mut self) -> Result<f64, ExprError> {
        self.skip_ws();
        let start = self.pos;
        if self.peek() == Some('-') {
            self.pos += 1;
        }
        while self.pos < self.input.len() {
            let c = self.input.as_bytes()[self.pos];
            if c.is_ascii_digit() || c == b'.' {
                self.pos += 1;
            } else {
                break;
            }
        }
        let s = &self.input[start..self.pos];
        s.parse::<f64>()
            .map_err(|_| ExprError::Parse(format!("bad number: {s}")))
    }
}
