//! Spike 3's mailbox rules, unchanged in behaviour.
//!
//! Ported from `core/src/lib.rs` at commit `698c2b27`: keys are remembered after
//! acknowledgement, sequence numbers order delivery, and a recurring task is saved state.
//! Each key and event is stored once and shared by reference, as the TypeScript rules
//! share JavaScript strings; remembered keys live in a hashed [`KeySet`].

use alloc::format;
use alloc::rc::Rc;
use alloc::vec;
use alloc::vec::Vec;

use crate::key_set::KeySet;
use crate::unacked::Unacked;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stored {
    pub seq: u64,
    pub key: Rc<str>,
    pub event: Rc<str>,
    pub acked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Input {
    Restore {
        events: Vec<Stored>,
        every_ms: Option<u64>,
    },
    Connect,
    Publish {
        key: Rc<str>,
        event: Rc<str>,
    },
    Ack {
        seq: u64,
    },
    Every {
        interval_ms: u64,
        now_ms: u64,
    },
    Tick {
        now_ms: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Effect {
    Persist {
        seq: u64,
        key: Rc<str>,
        event: Rc<str>,
    },
    MarkAcked {
        seq: u64,
    },
    Deliver {
        seq: u64,
        key: Rc<str>,
        event: Rc<str>,
    },
    SaveTask {
        interval_ms: u64,
    },
    SetAlarm {
        at_ms: u64,
    },
    Reply(Reply),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

#[derive(Debug)]
struct Pending {
    key: Rc<str>,
    event: Rc<str>,
}

#[derive(Debug, Default)]
pub struct Mailbox {
    next_seq: u64,
    remembered: KeySet,
    unacked: Unacked<Pending>,
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
            Input::Every {
                interval_ms,
                now_ms,
            } => {
                self.every_ms = Some(interval_ms);
                vec![
                    Effect::SaveTask { interval_ms },
                    Effect::SetAlarm {
                        at_ms: now_ms.saturating_add(interval_ms),
                    },
                    Effect::Reply(Reply::Scheduled),
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
            if stored.key.starts_with("tick:") {
                self.ticks = self.ticks.saturating_add(1);
            }
            if !stored.acked {
                let pending = Pending {
                    key: Rc::clone(&stored.key),
                    event: stored.event,
                };
                self.unacked.insert(stored.seq, pending);
            }
            self.remembered.insert(stored.key);
        }
        vec![Effect::Reply(Reply::Restored {
            unacked: self.unacked.len(),
            remembered: self.remembered.len(),
        })]
    }

    fn connect(&self) -> Vec<Effect> {
        let mut out: Vec<Effect> = self
            .unacked
            .iter()
            .map(|(seq, pending)| Effect::Deliver {
                seq,
                key: Rc::clone(&pending.key),
                event: Rc::clone(&pending.event),
            })
            .collect();
        out.push(Effect::Reply(Reply::Connected {
            pending: self.unacked.len(),
        }));
        out
    }

    fn publish(&mut self, key: Rc<str>, event: Rc<str>) -> Vec<Effect> {
        if !self.remembered.insert(Rc::clone(&key)) {
            return vec![Effect::Reply(Reply::Duplicate)];
        }
        self.next_seq = self.next_seq.saturating_add(1);
        let seq = self.next_seq;
        let pending = Pending {
            key: Rc::clone(&key),
            event: Rc::clone(&event),
        };
        self.unacked.insert(seq, pending);
        vec![
            Effect::Persist {
                seq,
                key: Rc::clone(&key),
                event: Rc::clone(&event),
            },
            Effect::Deliver { seq, key, event },
            Effect::Reply(Reply::Published { seq }),
        ]
    }

    fn ack(&mut self, seq: u64) -> Vec<Effect> {
        if self.unacked.remove(seq) {
            vec![
                Effect::MarkAcked { seq },
                Effect::Reply(Reply::Acked { seq }),
            ]
        } else {
            vec![Effect::Reply(Reply::UnknownSeq { seq })]
        }
    }

    fn tick(&mut self, now_ms: u64) -> Vec<Effect> {
        let Some(interval_ms) = self.every_ms else {
            return vec![Effect::Reply(Reply::Ticked)];
        };
        self.ticks = self.ticks.saturating_add(1);
        let key = Rc::from(format!("tick:{}", self.ticks));
        let event = Rc::from(format!("{{\"at_ms\":{now_ms}}}"));
        let mut out: Vec<Effect> = self
            .publish(key, event)
            .into_iter()
            .filter(|effect| !matches!(effect, Effect::Reply(_)))
            .collect();
        out.push(Effect::SetAlarm {
            at_ms: now_ms.saturating_add(interval_ms),
        });
        out.push(Effect::Reply(Reply::Ticked));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn publish(mailbox: &mut Mailbox, key: &str) -> Vec<Effect> {
        mailbox.handle(Input::Publish {
            key: key.into(),
            event: "{}".into(),
        })
    }

    #[test]
    fn duplicate_key_is_rejected_even_after_ack() {
        let mut mailbox = Mailbox::default();
        assert!(publish(&mut mailbox, "a").contains(&Effect::Reply(Reply::Published { seq: 1 })));
        let _ = mailbox.handle(Input::Ack { seq: 1 });
        assert_eq!(
            publish(&mut mailbox, "a"),
            [Effect::Reply(Reply::Duplicate)]
        );
    }

    #[test]
    fn restore_keeps_keys_and_redelivers_only_unacked() {
        let mut mailbox = Mailbox::default();
        let events = Vec::from([
            Stored {
                seq: 1,
                key: "a".into(),
                event: "{}".into(),
                acked: true,
            },
            Stored {
                seq: 2,
                key: "b".into(),
                event: "{}".into(),
                acked: false,
            },
        ]);
        let _ = mailbox.handle(Input::Restore {
            events,
            every_ms: None,
        });
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
            [Effect::Reply(Reply::Duplicate)]
        );
        assert!(publish(&mut mailbox, "c").contains(&Effect::Reply(Reply::Published { seq: 3 })));
    }
}
