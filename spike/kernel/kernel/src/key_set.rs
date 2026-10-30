//! A set of shared strings: open addressing, linear probing, FNV-1a hashes.
//!
//! Without `std` the only built-in set is `BTreeSet`, whose lookups compare whole
//! strings at every level of the tree. This set compares a stored hash first and
//! the text only on a hash match. FNV-1a is not keyed, so keys chosen to collide
//! make lookups linear; a shipping kernel needs a keyed hash with a seed from the shell.

use alloc::rc::Rc;
use alloc::vec;
use alloc::vec::Vec;

const FNV_OFFSET: usize = 0x811c_9dc5;
const FNV_PRIME: usize = 0x0100_0193;
const MIN_SLOTS: usize = 16;

type Slot = Option<(usize, Rc<str>)>;

fn hash(text: &str) -> usize {
    text.bytes().fold(FNV_OFFSET, |hash, byte| {
        (hash ^ usize::from(byte)).wrapping_mul(FNV_PRIME)
    })
}

#[derive(Debug, Default)]
pub struct KeySet {
    /// Always empty or a power of two in length, and never more than 7/8 full.
    slots: Vec<Slot>,
    len: usize,
}

impl KeySet {
    #[must_use]
    pub const fn len(&self) -> usize {
        self.len
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[must_use]
    pub fn contains(&self, text: &str) -> bool {
        let hash = hash(text);
        let start = hash & self.slots.len().wrapping_sub(1);
        let Some((head, tail)) = self.slots.split_at_checked(start) else {
            return false;
        };
        tail.iter()
            .chain(head)
            .map_while(Option::as_ref)
            .any(|(stored, key)| *stored == hash && **key == *text)
    }

    /// Adds `text`; returns `false` when it was already present.
    pub fn insert(&mut self, text: Rc<str>) -> bool {
        if self.len >= self.slots.len().saturating_sub(self.slots.len() >> 3) {
            self.grow();
        }
        let hash = hash(&text);
        match self.slot_for(hash, &text) {
            Some(Some(_)) => false,
            Some(slot) => {
                *slot = Some((hash, text));
                self.len = self.len.saturating_add(1);
                true
            }
            // The load limit above leaves an empty slot, so this only runs if that
            // invariant breaks; growing restores it rather than losing the key.
            None => {
                self.grow();
                self.insert(text)
            }
        }
    }

    /// The slot holding `text`, or the empty slot where it belongs; `None` when every slot is taken.
    fn slot_for(&mut self, hash: usize, text: &str) -> Option<&mut Slot> {
        let start = hash & self.slots.len().wrapping_sub(1);
        let (head, tail) = self.slots.split_at_mut_checked(start)?;
        tail.iter_mut().chain(head).find(|slot| {
            slot.as_ref()
                .is_none_or(|(stored, key)| *stored == hash && **key == *text)
        })
    }

    fn grow(&mut self) {
        let slots = self.slots.len().saturating_mul(2).max(MIN_SLOTS);
        let old = core::mem::replace(&mut self.slots, vec![None; slots]);
        for (hash, text) in old.into_iter().flatten() {
            // The new table has at least twice the slots of the old, so every
            // key finds an empty one.
            if let Some(slot) = self.slot_for(hash, &text) {
                *slot = Some((hash, text));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::format;

    #[test]
    fn insert_reports_duplicates() {
        let mut set = KeySet::default();
        assert!(!set.contains("a"));
        assert!(set.insert("a".into()));
        assert!(!set.insert("a".into()));
        assert!(set.contains("a"));
        assert_eq!(set.len(), 1);
    }

    #[test]
    fn equal_hashes_still_compare_text() {
        let mut set = KeySet::default();
        assert!(set.insert("b".into()));
        let impostor = set.slots.iter_mut().flatten().next().unwrap();
        impostor.0 = hash("a");
        let start = hash("a") & (set.slots.len() - 1);
        let at = set.slots.iter().position(Option::is_some).unwrap();
        set.slots.swap(start, at);
        assert!(!set.contains("a"));
        assert!(set.insert("a".into()));
        assert!(set.contains("a"));
        assert_eq!(set.len(), 2);
    }

    #[test]
    fn keeps_every_key_across_growth() {
        let mut set = KeySet::default();
        for i in 0..10_000 {
            assert!(set.insert(format!("k{i}").into()));
        }
        assert_eq!(set.len(), 10_000);
        for i in 0..10_000 {
            assert!(set.contains(&format!("k{i}")));
            assert!(!set.insert(format!("k{i}").into()));
        }
        assert!(!set.contains("k10000"));
    }
}
