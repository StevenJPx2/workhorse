//! Binary wire format between the shell and the kernel. All integers are
//! little-endian.
//!
//! A batch is `u32 count` then `count` inputs, each a `u8` tag and its fields;
//! input text is a `u32` byte length followed by UTF-8. The output is, for each
//! input in order, `u32 count` then that many effects. Effect text is a `u8` kind:
//! [`TEXT_INLINE`] followed by a length and UTF-8, or [`TEXT_INPUT_KEY`] or
//! [`TEXT_INPUT_EVENT`] when it is the very text of the input that caused it,
//! which the shell already holds.
//!
//! Input bytes come from the shell and are treated as hostile: every length is
//! checked against the remaining bytes and a limit before anything is allocated.

use alloc::rc::Rc;
use alloc::vec::Vec;
use core::fmt;

use crate::mailbox::{Effect, Input, Mailbox, Reply, Stored};

/// Most inputs in one batch.
pub const MAX_BATCH: usize = 4096;
/// Most events in one `Restore`.
pub const MAX_RESTORE: usize = 1 << 20;
/// Longest key or event, in bytes.
pub const MAX_TEXT: usize = 64 * 1024;

/// Effect text follows inline.
pub const TEXT_INLINE: u8 = 0;
/// Effect text is the key of the input that caused the effect.
pub const TEXT_INPUT_KEY: u8 = 1;
/// Effect text is the event of the input that caused the effect.
pub const TEXT_INPUT_EVENT: u8 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WireError {
    Truncated,
    UnknownTag(u8),
    InvalidFlag(u8),
    TooMany,
    TooLong,
    NotUtf8,
    Trailing,
    Overflow,
}

impl fmt::Display for WireError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Truncated => f.write_str("input ends early"),
            Self::UnknownTag(tag) => write!(f, "unknown tag {tag}"),
            Self::InvalidFlag(flag) => write!(f, "invalid flag {flag}"),
            Self::TooMany => f.write_str("too many items"),
            Self::TooLong => f.write_str("text too long"),
            Self::NotUtf8 => f.write_str("text is not utf-8"),
            Self::Trailing => f.write_str("bytes after the last input"),
            Self::Overflow => f.write_str("length does not fit"),
        }
    }
}

impl core::error::Error for WireError {}

struct Reader<'a> {
    bytes: &'a [u8],
}

impl<'a> Reader<'a> {
    fn take(&mut self, len: usize) -> Result<&'a [u8], WireError> {
        let (head, rest) = self
            .bytes
            .split_at_checked(len)
            .ok_or(WireError::Truncated)?;
        self.bytes = rest;
        Ok(head)
    }

    fn array<const N: usize>(&mut self) -> Result<[u8; N], WireError> {
        self.take(N)?.try_into().map_err(|_| WireError::Truncated)
    }

    fn u8(&mut self) -> Result<u8, WireError> {
        let [byte] = self.array::<1>()?;
        Ok(byte)
    }

    fn u64(&mut self) -> Result<u64, WireError> {
        Ok(u64::from_le_bytes(self.array()?))
    }

    fn count(&mut self, max: usize) -> Result<usize, WireError> {
        let count =
            usize::try_from(u32::from_le_bytes(self.array()?)).map_err(|_| WireError::Overflow)?;
        if count > max {
            return Err(WireError::TooMany);
        }
        Ok(count)
    }

    fn flag(&mut self) -> Result<bool, WireError> {
        match self.u8()? {
            0 => Ok(false),
            1 => Ok(true),
            other => Err(WireError::InvalidFlag(other)),
        }
    }

    fn text(&mut self) -> Result<Rc<str>, WireError> {
        let len =
            usize::try_from(u32::from_le_bytes(self.array()?)).map_err(|_| WireError::Overflow)?;
        if len > MAX_TEXT {
            return Err(WireError::TooLong);
        }
        let bytes = self.take(len)?;
        core::str::from_utf8(bytes)
            .map(Rc::from)
            .map_err(|_| WireError::NotUtf8)
    }

    fn stored(&mut self) -> Result<Stored, WireError> {
        Ok(Stored {
            seq: self.u64()?,
            key: self.text()?,
            event: self.text()?,
            acked: self.flag()?,
        })
    }

    fn input(&mut self) -> Result<Input, WireError> {
        match self.u8()? {
            0 => {
                let count = self.count(MAX_RESTORE)?;
                let events = (0..count)
                    .map(|_| self.stored())
                    .collect::<Result<Vec<_>, _>>()?;
                let every_ms = if self.flag()? {
                    Some(self.u64()?)
                } else {
                    None
                };
                Ok(Input::Restore { events, every_ms })
            }
            1 => Ok(Input::Connect),
            2 => Ok(Input::Publish {
                key: self.text()?,
                event: self.text()?,
            }),
            3 => Ok(Input::Ack { seq: self.u64()? }),
            4 => Ok(Input::Every {
                interval_ms: self.u64()?,
                now_ms: self.u64()?,
            }),
            5 => Ok(Input::Tick {
                now_ms: self.u64()?,
            }),
            tag => Err(WireError::UnknownTag(tag)),
        }
    }
}

/// Decodes one batch of inputs.
///
/// # Errors
///
/// Returns a [`WireError`] when the bytes are not exactly one well-formed batch.
pub fn decode_batch(bytes: &[u8]) -> Result<Vec<Input>, WireError> {
    let mut reader = Reader { bytes };
    let count = reader.count(MAX_BATCH)?;
    let inputs = (0..count)
        .map(|_| reader.input())
        .collect::<Result<Vec<_>, _>>()?;
    if !reader.bytes.is_empty() {
        return Err(WireError::Trailing);
    }
    Ok(inputs)
}

/// The texts of the input being encoded, which its effects refer to instead of repeating.
#[derive(Default)]
struct Origin {
    key: Option<Rc<str>>,
    event: Option<Rc<str>>,
}

impl Origin {
    fn of(input: &Input) -> Self {
        match input {
            Input::Publish { key, event } => Self {
                key: Some(Rc::clone(key)),
                event: Some(Rc::clone(event)),
            },
            _ => Self::default(),
        }
    }

    fn refers(field: Option<&Rc<str>>, text: &Rc<str>) -> bool {
        field.is_some_and(|field| Rc::ptr_eq(field, text))
    }
}

struct Writer<'a> {
    out: &'a mut Vec<u8>,
    origin: Origin,
}

impl Writer<'_> {
    fn u8(&mut self, value: u8) {
        self.out.push(value);
    }

    fn u64(&mut self, value: u64) {
        self.out.extend_from_slice(&value.to_le_bytes());
    }

    fn len(&mut self, len: usize) -> Result<(), WireError> {
        let len = u32::try_from(len).map_err(|_| WireError::Overflow)?;
        self.out.extend_from_slice(&len.to_le_bytes());
        Ok(())
    }

    fn text(&mut self, text: &Rc<str>) -> Result<(), WireError> {
        if Origin::refers(self.origin.key.as_ref(), text) {
            self.u8(TEXT_INPUT_KEY);
            return Ok(());
        }
        if Origin::refers(self.origin.event.as_ref(), text) {
            self.u8(TEXT_INPUT_EVENT);
            return Ok(());
        }
        self.u8(TEXT_INLINE);
        self.len(text.len())?;
        self.out.extend_from_slice(text.as_bytes());
        Ok(())
    }

    fn count(&mut self, count: usize) -> Result<(), WireError> {
        self.u64(u64::try_from(count).map_err(|_| WireError::Overflow)?);
        Ok(())
    }

    fn reply(&mut self, reply: Reply) -> Result<(), WireError> {
        match reply {
            Reply::Published { seq } => self.tagged(0, seq),
            Reply::Duplicate => self.u8(1),
            Reply::Acked { seq } => self.tagged(2, seq),
            Reply::UnknownSeq { seq } => self.tagged(3, seq),
            Reply::Scheduled => self.u8(4),
            Reply::Restored {
                unacked,
                remembered,
            } => {
                self.u8(5);
                self.count(unacked)?;
                self.count(remembered)?;
            }
            Reply::Connected { pending } => {
                self.u8(6);
                self.count(pending)?;
            }
            Reply::Ticked => self.u8(7),
        }
        Ok(())
    }

    fn tagged(&mut self, tag: u8, value: u64) {
        self.u8(tag);
        self.u64(value);
    }

    fn event(
        &mut self,
        tag: u8,
        seq: u64,
        key: &Rc<str>,
        event: &Rc<str>,
    ) -> Result<(), WireError> {
        self.tagged(tag, seq);
        self.text(key)?;
        self.text(event)
    }

    fn effect(&mut self, effect: &Effect) -> Result<(), WireError> {
        match effect {
            Effect::Persist { seq, key, event } => self.event(0, *seq, key, event),
            Effect::MarkAcked { seq } => {
                self.tagged(1, *seq);
                Ok(())
            }
            Effect::Deliver { seq, key, event } => self.event(2, *seq, key, event),
            Effect::SaveTask { interval_ms } => {
                self.tagged(3, *interval_ms);
                Ok(())
            }
            Effect::SetAlarm { at_ms } => {
                self.tagged(4, *at_ms);
                Ok(())
            }
            Effect::Reply(reply) => {
                self.u8(5);
                self.reply(*reply)
            }
        }
    }
}

/// Decodes one batch, runs each input through `mailbox` in order, and appends each
/// input's effects to `out`. Nothing runs unless the whole batch decodes.
///
/// # Errors
///
/// Returns a [`WireError`] when the bytes are not exactly one well-formed batch, or
/// [`WireError::Overflow`] when an output length does not fit in a `u32`.
pub fn step(mailbox: &mut Mailbox, bytes: &[u8], out: &mut Vec<u8>) -> Result<(), WireError> {
    let inputs = decode_batch(bytes)?;
    let mut writer = Writer {
        out,
        origin: Origin::default(),
    };
    for input in inputs {
        writer.origin = Origin::of(&input);
        let effects = mailbox.handle(input);
        writer.len(effects.len())?;
        for effect in &effects {
            writer.effect(effect)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;

    fn text(bytes: &mut Vec<u8>, text: &[u8]) {
        bytes.extend_from_slice(&u32::try_from(text.len()).unwrap().to_le_bytes());
        bytes.extend_from_slice(text);
    }

    fn publish_batch(key: &[u8]) -> Vec<u8> {
        let mut bytes = 1u32.to_le_bytes().to_vec();
        bytes.push(2);
        text(&mut bytes, key);
        text(&mut bytes, b"{}");
        bytes
    }

    #[test]
    fn decodes_a_publish() {
        assert_eq!(
            decode_batch(&publish_batch(b"k")),
            Ok(vec![Input::Publish {
                key: "k".into(),
                event: "{}".into()
            }])
        );
    }

    #[test]
    fn rejects_malformed_batches() {
        let good = publish_batch(b"k");
        assert_eq!(
            decode_batch(&good[..good.len() - 1]),
            Err(WireError::Truncated)
        );
        assert_eq!(
            decode_batch(&[good.as_slice(), &[0]].concat()),
            Err(WireError::Trailing)
        );
        assert_eq!(
            decode_batch(&publish_batch(&[0xff])),
            Err(WireError::NotUtf8)
        );
        assert_eq!(
            decode_batch(&[1, 0, 0, 0, 9]),
            Err(WireError::UnknownTag(9))
        );
        assert_eq!(
            decode_batch(&u32::MAX.to_le_bytes()),
            Err(WireError::TooMany)
        );
    }

    #[test]
    fn rejects_text_over_the_limit_before_reading_it() {
        let mut bytes = vec![1, 0, 0, 0, 2];
        bytes.extend_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(decode_batch(&bytes), Err(WireError::TooLong));
    }

    #[test]
    fn publish_effects_refer_to_the_input_texts() {
        let mut out = Vec::new();
        step(&mut Mailbox::default(), &publish_batch(b"k"), &mut out).unwrap();
        let mut expected = 3u32.to_le_bytes().to_vec();
        for tag in [0, 2] {
            expected.push(tag);
            expected.extend_from_slice(&1u64.to_le_bytes());
            expected.extend_from_slice(&[TEXT_INPUT_KEY, TEXT_INPUT_EVENT]);
        }
        expected.extend_from_slice(&[5, 0]);
        expected.extend_from_slice(&1u64.to_le_bytes());
        assert_eq!(out, expected);
    }

    #[test]
    fn texts_from_state_are_inline() {
        let mut mailbox = Mailbox::default();
        let mut out = Vec::new();
        step(&mut mailbox, &publish_batch(b"k"), &mut out).unwrap();
        out.clear();
        step(&mut mailbox, &[1, 0, 0, 0, 1], &mut out).unwrap();
        let mut expected = 2u32.to_le_bytes().to_vec();
        expected.push(2);
        expected.extend_from_slice(&1u64.to_le_bytes());
        expected.push(TEXT_INLINE);
        text(&mut expected, b"k");
        expected.push(TEXT_INLINE);
        text(&mut expected, b"{}");
        expected.extend_from_slice(&[5, 6]);
        expected.extend_from_slice(&1u64.to_le_bytes());
        assert_eq!(out, expected);
    }

    #[test]
    fn a_malformed_batch_runs_nothing() {
        let mut mailbox = Mailbox::default();
        let mut bad = 2u32.to_le_bytes().to_vec();
        bad.extend_from_slice(&publish_batch(b"k")[4..]);
        bad.push(9);
        assert_eq!(
            step(&mut mailbox, &bad, &mut Vec::new()),
            Err(WireError::UnknownTag(9))
        );
        assert_eq!(
            mailbox.handle(Input::Publish {
                key: "k".into(),
                event: "{}".into()
            }),
            [
                Effect::Persist {
                    seq: 1,
                    key: "k".into(),
                    event: "{}".into()
                },
                Effect::Deliver {
                    seq: 1,
                    key: "k".into(),
                    event: "{}".into()
                },
                Effect::Reply(Reply::Published { seq: 1 })
            ]
        );
    }
}
