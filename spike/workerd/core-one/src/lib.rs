//! Spike core (variant C): the mailbox rules and their wasm glue in one crate.
//!
//! Inputs come from the shell; effects go back to the shell. The shell owns
//! storage, the clock, sockets, and alarms. `clippy.toml` bans I/O and
//! JavaScript types everywhere except the private `glue` module.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct Stored {
    pub seq: u64,
    pub key: String,
    pub event: String,
    pub acked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Input {
    Restore { events: Vec<Stored>, every_ms: Option<u64> },
    Connect,
    Publish { key: String, event: String },
    Ack { seq: u64 },
    Every { interval_ms: u64, now_ms: u64 },
    Tick { now_ms: u64 },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Effect {
    Persist { seq: u64, key: String, event: String },
    MarkAcked { seq: u64 },
    Deliver { seq: u64, key: String, event: String },
    SaveTask { interval_ms: u64 },
    SetAlarm { at_ms: u64 },
    Reply { result: Reply },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum Reply {
    Published { seq: u64 },
    Duplicate,
    Acked { seq: u64 },
    UnknownSeq { seq: u64 },
    Scheduled,
    Restored { unacked: usize, remembered: usize },
    Connected { pending: usize },
    Ticked,
}

#[derive(Debug, Default)]
pub struct Mailbox {
    next_seq: u64,
    remembered: BTreeSet<String>,
    unacked: BTreeMap<u64, (String, String)>,
    every_ms: Option<u64>,
    ticks: u64,
}

impl Mailbox {
    #[must_use]
    pub fn handle(&mut self, input: Input) -> Vec<Effect> {
        match input {
            Input::Restore { events, every_ms } => self.restore(events, every_ms),
            Input::Connect => self.connect(),
            Input::Publish { key, event } => self.publish(key, event),
            Input::Ack { seq } => self.ack(seq),
            Input::Every { interval_ms, now_ms } => {
                self.every_ms = Some(interval_ms);
                let at_ms = now_ms.saturating_add(interval_ms);
                vec![
                    Effect::SaveTask { interval_ms },
                    Effect::SetAlarm { at_ms },
                    Effect::Reply { result: Reply::Scheduled },
                ]
            }
            Input::Tick { now_ms } => self.tick(now_ms),
        }
    }

    fn restore(&mut self, events: Vec<Stored>, every_ms: Option<u64>) -> Vec<Effect> {
        *self = Self::default();
        self.every_ms = every_ms;
        for stored in events {
            self.next_seq = self.next_seq.max(stored.seq);
            self.remembered.insert(stored.key.clone());
            if stored.key.starts_with("tick:") {
                self.ticks = self.ticks.saturating_add(1);
            }
            if !stored.acked {
                self.unacked.insert(stored.seq, (stored.key, stored.event));
            }
        }
        let result = Reply::Restored {
            unacked: self.unacked.len(),
            remembered: self.remembered.len(),
        };
        vec![Effect::Reply { result }]
    }

    fn connect(&self) -> Vec<Effect> {
        let mut out: Vec<Effect> = self
            .unacked
            .iter()
            .map(|(seq, (key, event))| Effect::Deliver {
                seq: *seq,
                key: key.clone(),
                event: event.clone(),
            })
            .collect();
        out.push(Effect::Reply {
            result: Reply::Connected { pending: self.unacked.len() },
        });
        out
    }

    fn publish(&mut self, key: String, event: String) -> Vec<Effect> {
        if !self.remembered.insert(key.clone()) {
            return vec![Effect::Reply { result: Reply::Duplicate }];
        }
        self.next_seq = self.next_seq.saturating_add(1);
        let seq = self.next_seq;
        self.unacked.insert(seq, (key.clone(), event.clone()));
        vec![
            Effect::Persist { seq, key: key.clone(), event: event.clone() },
            Effect::Deliver { seq, key, event },
            Effect::Reply { result: Reply::Published { seq } },
        ]
    }

    fn ack(&mut self, seq: u64) -> Vec<Effect> {
        if self.unacked.remove(&seq).is_some() {
            vec![Effect::MarkAcked { seq }, Effect::Reply { result: Reply::Acked { seq } }]
        } else {
            vec![Effect::Reply { result: Reply::UnknownSeq { seq } }]
        }
    }

    fn tick(&mut self, now_ms: u64) -> Vec<Effect> {
        let Some(interval_ms) = self.every_ms else {
            return vec![Effect::Reply { result: Reply::Ticked }];
        };
        self.ticks = self.ticks.saturating_add(1);
        let key = format!("tick:{}", self.ticks);
        let event = format!("{{\"at_ms\":{now_ms}}}");
        let mut out: Vec<Effect> = self
            .publish(key, event)
            .into_iter()
            .filter(|effect| !matches!(effect, Effect::Reply { .. }))
            .collect();
        out.push(Effect::SetAlarm { at_ms: now_ms.saturating_add(interval_ms) });
        out.push(Effect::Reply { result: Reply::Ticked });
        out
    }
}

#[allow(
    clippy::disallowed_types,
    reason = "the wasm boundary is the one place JavaScript types belong"
)]
mod glue {
    use wasm_bindgen::prelude::*;

    use super::{Input, Mailbox};

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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn publish(mailbox: &mut Mailbox, key: &str) -> Vec<Effect> {
        mailbox.handle(Input::Publish { key: key.into(), event: "{}".into() })
    }

    #[test]
    fn duplicate_key_is_rejected_even_after_ack() {
        let mut mailbox = Mailbox::default();
        assert!(publish(&mut mailbox, "a").contains(&Effect::Reply {
            result: Reply::Published { seq: 1 }
        }));
        let _ = mailbox.handle(Input::Ack { seq: 1 });
        assert_eq!(
            publish(&mut mailbox, "a"),
            [Effect::Reply { result: Reply::Duplicate }]
        );
    }

    #[test]
    fn restore_keeps_keys_and_redelivers_only_unacked() {
        let mut mailbox = Mailbox::default();
        let events = Vec::from([
            Stored { seq: 1, key: "a".into(), event: "{}".into(), acked: true },
            Stored { seq: 2, key: "b".into(), event: "{}".into(), acked: false },
        ]);
        let _ = mailbox.handle(Input::Restore { events, every_ms: None });
        let delivered: Vec<u64> = mailbox
            .handle(Input::Connect)
            .into_iter()
            .filter_map(|effect| match effect {
                Effect::Deliver { seq, .. } => Some(seq),
                _ => None,
            })
            .collect();
        assert_eq!(delivered, [2]);
        assert_eq!(
            publish(&mut mailbox, "a"),
            [Effect::Reply { result: Reply::Duplicate }]
        );
        assert!(publish(&mut mailbox, "c").contains(&Effect::Reply {
            result: Reply::Published { seq: 3 }
        }));
    }
}
