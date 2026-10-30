//! Spike kernel: spike 3's mailbox rules plus a binary wire format, with no I/O.
//!
//! The shell sends a batch of inputs as bytes and performs the effects it gets
//! back. Storage, the clock, sockets and alarms belong to the shell.
#![no_std]
#![forbid(unsafe_code)]

extern crate alloc;

pub mod key_set;
pub mod mailbox;
pub mod unacked;
pub mod wire;

pub use mailbox::{Effect, Input, Mailbox, Reply, Stored};
