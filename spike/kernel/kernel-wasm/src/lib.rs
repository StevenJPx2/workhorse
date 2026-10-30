//! Raw wasm exports over Rust-owned buffers: no wasm-bindgen, no JSON.
//!
//! The host asks [`alloc`] for an input buffer, and again only to grow it. For each
//! batch it writes the encoded inputs at the buffer's start, calls [`step`] for a
//! mailbox, then reads [`step`]'s result length from the buffer at [`output`]. The host never hands Rust a pointer, so no export
//! dereferences one; the only unsafe item is each export's unmangled symbol.

use std::cell::RefCell;
use std::collections::BTreeMap;

use spike_kernel::Mailbox;
use spike_kernel::wire::{self, WireError};

/// Largest batch the host may write, in bytes.
const MAX_INPUT: usize = 16 * 1024 * 1024;

#[derive(Default)]
struct Host {
    input: Vec<u8>,
    output: Vec<u8>,
    mailboxes: BTreeMap<u32, Mailbox>,
}

thread_local! {
    static HOST: RefCell<Host> = RefCell::new(Host::default());
}

/// Returns a pointer to an input buffer of `len` bytes, or null when `len` is over [`MAX_INPUT`].
/// The buffer stays at that address, and every [`step`] reads from it, until the next call.
#[expect(
    unsafe_code,
    reason = "a wasm export needs an unmangled symbol; the body is safe Rust"
)]
#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    let Some(len) = usize::try_from(len).ok().filter(|len| *len <= MAX_INPUT) else {
        return std::ptr::null_mut();
    };
    HOST.with_borrow_mut(|host| {
        host.input.clear();
        host.input.resize(len, 0);
        host.input.as_mut_ptr()
    })
}

/// Runs the first `len` input bytes through `mailbox`, creating it on first use.
/// Returns the output length, or a negative error code.
#[expect(
    unsafe_code,
    reason = "a wasm export needs an unmangled symbol; the body is safe Rust"
)]
#[unsafe(no_mangle)]
pub extern "C" fn step(mailbox: u32, len: u32) -> i32 {
    HOST.with_borrow_mut(|host| run(host, mailbox, len).unwrap_or_else(StepError::code))
}

/// Returns a pointer to the output written by the last [`step`].
#[expect(
    unsafe_code,
    reason = "a wasm export needs an unmangled symbol; the body is safe Rust"
)]
#[unsafe(no_mangle)]
pub extern "C" fn output() -> *const u8 {
    HOST.with_borrow(|host| host.output.as_ptr())
}

/// Drops a mailbox's in-memory state.
#[expect(
    unsafe_code,
    reason = "a wasm export needs an unmangled symbol; the body is safe Rust"
)]
#[unsafe(no_mangle)]
pub extern "C" fn close(mailbox: u32) {
    HOST.with_borrow_mut(|host| host.mailboxes.remove(&mailbox));
}

enum StepError {
    Length,
    Wire(WireError),
}

impl StepError {
    const fn code(self) -> i32 {
        match self {
            Self::Length => -1,
            Self::Wire(WireError::Truncated) => -2,
            Self::Wire(WireError::UnknownTag(_)) => -3,
            Self::Wire(WireError::InvalidFlag(_)) => -4,
            Self::Wire(WireError::TooMany) => -5,
            Self::Wire(WireError::TooLong) => -6,
            Self::Wire(WireError::NotUtf8) => -7,
            Self::Wire(WireError::Trailing) => -8,
            Self::Wire(WireError::Overflow) => -9,
        }
    }
}

fn run(host: &mut Host, mailbox: u32, len: u32) -> Result<i32, StepError> {
    let len = usize::try_from(len).map_err(|_| StepError::Length)?;
    let bytes = host.input.get(..len).ok_or(StepError::Length)?;
    let state = host.mailboxes.entry(mailbox).or_default();
    host.output.clear();
    wire::step(state, bytes, &mut host.output).map_err(StepError::Wire)?;
    i32::try_from(host.output.len()).map_err(|_| StepError::Wire(WireError::Overflow))
}
