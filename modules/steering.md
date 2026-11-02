# `steering`

**Kind:** contract, layer 1. **Status:** proposed, not built.

Rules that fire on an agent's events and block, rewrite or ask a human. Steering works inside a session's grant: it can make an action narrower or stop it, never allow what the grant does not.

## Owns

- Normalized agent events: the same shape whichever agent reported them.
- The rule format.
- Verdicts: allow, block, rewrite or ask.

## Does not own

- What a session may touch at all: that belongs to [`grant`](grant.md).
- Getting events out of each agent and applying verdicts there: that belongs to [`tack`](tack.md).
- Waiting for a human's answer: that belongs to [`approvals`](approvals.md).

## Depends on

[`grant`](grant.md), to check that no verdict exceeds the grant. Pure Rust with no I/O; also builds for wasm.

## Decisions

- **The grant is the ceiling.** A rule can block, rewrite or ask, never widen (2026-11-02).
- **Rules about arguments belong here**, not in the grant (2026-11-02).
- **Rules are evaluated in the daemon**, the one source of truth (2026-11-02). tack forwards events and applies verdicts. tack embeds this crate as wasm only if the round trip proves too slow.

## Open questions

- Which events each agent really reports and enforces, and how each fails closed: [planned spike](../spike/resume-and-events/PLAN.md).
- The rule format itself.
- What a rule may match on: event type, tool name, arguments, paths, session.

## Evidence

- tack's capability matrix (`spike/unagent/MATRIX.md` on the `tack` branch): events, actions and failure behaviour per agent, from documentation and source.
- [nanocode](../evidence/nanocode.md): its `steer` means adding input to a running turn, which is a harness feature, not this module.
