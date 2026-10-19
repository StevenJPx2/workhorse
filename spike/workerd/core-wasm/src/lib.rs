//! wasm glue: JSON in, JSON effects out. All rules live in `spike-core`.

use spike_core::{Input, Mailbox};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Core(Mailbox);

#[wasm_bindgen]
impl Core {
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new() -> Self {
        Self(Mailbox::default())
    }

    /// # Errors
    /// Returns an error when `input` is not a valid input message.
    pub fn handle(&mut self, input: &str) -> Result<String, JsError> {
        let input: Input = serde_json::from_str(input)?;
        Ok(serde_json::to_string(&self.0.handle(input))?)
    }
}

impl Default for Core {
    fn default() -> Self {
        Self::new()
    }
}
