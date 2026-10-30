//! Unacknowledged events, ordered by sequence number.
//!
//! Sequence numbers only grow, so a publish appends and an acknowledgement usually
//! hits the oldest entry. A deque sorted by sequence number makes both constant time
//! in that case and a binary search otherwise, where a `BTreeMap`'s cost grows with
//! the backlog. An acknowledged entry in the middle becomes a tombstone; tombstones
//! leave from the front, and are compacted once they outnumber live entries.

use alloc::collections::VecDeque;

/// Tombstones tolerated before compaction regardless of the live count.
const SLACK: usize = 16;

#[derive(Debug)]
pub struct Unacked<T> {
    entries: VecDeque<(u64, Option<T>)>,
    live: usize,
}

impl<T> Default for Unacked<T> {
    fn default() -> Self {
        Self {
            entries: VecDeque::new(),
            live: 0,
        }
    }
}

impl<T> Unacked<T> {
    #[must_use]
    pub const fn len(&self) -> usize {
        self.live
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.live == 0
    }

    /// Adds or replaces the entry for `seq`.
    pub fn insert(&mut self, seq: u64, value: T) {
        if self.entries.back().is_none_or(|(last, _)| *last < seq) {
            self.entries.push_back((seq, Some(value)));
            self.live = self.live.saturating_add(1);
            return;
        }
        match self.entries.binary_search_by_key(&seq, |(key, _)| *key) {
            Ok(index) => {
                if let Some((_, slot)) = self.entries.get_mut(index)
                    && slot.replace(value).is_none()
                {
                    self.live = self.live.saturating_add(1);
                }
            }
            Err(index) => {
                self.entries.insert(index, (seq, Some(value)));
                self.live = self.live.saturating_add(1);
            }
        }
    }

    /// Removes the entry for `seq`; returns `false` when there was none.
    pub fn remove(&mut self, seq: u64) -> bool {
        let Ok(index) = self.entries.binary_search_by_key(&seq, |(key, _)| *key) else {
            return false;
        };
        let removed = self
            .entries
            .get_mut(index)
            .and_then(|(_, slot)| slot.take())
            .is_some();
        if removed {
            self.live = self.live.saturating_sub(1);
            self.drop_tombstones();
        }
        removed
    }

    /// Live entries in sequence order.
    pub fn iter(&self) -> impl Iterator<Item = (u64, &T)> {
        self.entries
            .iter()
            .filter_map(|(seq, slot)| slot.as_ref().map(|value| (*seq, value)))
    }

    fn drop_tombstones(&mut self) {
        while self.entries.front().is_some_and(|(_, slot)| slot.is_none()) {
            self.entries.pop_front();
        }
        if self.entries.len() > self.live.saturating_mul(2).saturating_add(SLACK) {
            self.entries.retain(|(_, slot)| slot.is_some());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec::Vec;

    fn seqs(unacked: &Unacked<u64>) -> Vec<u64> {
        unacked.iter().map(|(seq, _)| seq).collect()
    }

    #[test]
    fn in_order_publish_and_ack_leaves_nothing_behind() {
        let mut unacked = Unacked::default();
        for seq in 1..=100 {
            unacked.insert(seq, seq);
            assert!(unacked.remove(seq));
        }
        assert!(unacked.is_empty());
        assert!(unacked.entries.is_empty());
    }

    #[test]
    fn out_of_order_acks_keep_order_and_bound_tombstones() {
        let mut unacked = Unacked::default();
        for seq in 1..=1000 {
            unacked.insert(seq, seq);
        }
        for seq in (2..=1000).step_by(2) {
            assert!(unacked.remove(seq));
        }
        assert!(!unacked.remove(2));
        assert_eq!(unacked.len(), 500);
        assert_eq!(seqs(&unacked), (1..=999).step_by(2).collect::<Vec<_>>());
        assert!(unacked.entries.len() <= 2 * unacked.len() + SLACK);
        for seq in (3..=999).step_by(2) {
            assert!(unacked.remove(seq));
        }
        assert_eq!(seqs(&unacked), [1]);
        assert!(unacked.entries.len() <= 2 + SLACK);
    }

    #[test]
    fn unsorted_and_repeated_inserts_behave_like_a_map() {
        let mut unacked = Unacked::default();
        for (seq, value) in [(5, 50), (2, 20), (9, 90), (2, 21), (7, 70)] {
            unacked.insert(seq, value);
        }
        let entries: Vec<(u64, u64)> = unacked.iter().map(|(seq, value)| (seq, *value)).collect();
        assert_eq!(entries, [(2, 21), (5, 50), (7, 70), (9, 90)]);
        assert_eq!(unacked.len(), 4);
        assert!(unacked.remove(5));
        unacked.insert(5, 51);
        assert_eq!(unacked.len(), 4);
        assert!(!unacked.remove(4));
    }
}
