# Agent Instructions

## Sources

- **Code:** Before writing, modifying, refactoring, reviewing, or debugging code, load and apply the global `code-discipline` skill and its active language reference.
- **Architecture:** Before changing protocols, capability boundaries, sandboxing, extensibility, package or crate boundaries, or product responsibilities, read `ARCHITECTURE.md`.
- **Design:** Before introducing or reshaping an abstraction, read `PHILOSOPHY.md`.

Treat files under `spike/`, and the `legacy` and `fleet-v0` branches, as evidence, not production architecture. A successful experiment proves feasibility; it does not define the shipping design.

## Doctrine

Workhorse is a light, pluggable base built on open standards. Harness products remain outside the base.

- **Simple:** Preserve complexity required by the domain; reject complication introduced by the implementation.
- **Explicit:** Make state, effects, errors, ownership, dependencies, permissions, and lifecycle visible.
- **Bounded:** Limit resources, concurrency, retries, queues, and background work.
- **Vertical:** Build the smallest complete behavior through its real boundary.
- **Proof:** Finish with executed evidence that would fail if the behavior broke.

An abstraction is justified only when it removes concepts from the caller's mental model. Extensibility belongs at deliberate plugin and capability boundaries, not throughout ordinary internal code.

## Project Rules

- Make invalid decisions difficult to express through strict APIs and hard module boundaries.
- Keep protocol packages limited to contracts, serialization, and protocol invariants.
- Keep runtime packages independent of concrete providers; assemble implementations at composition roots.
- Treat capability, path, permission, protocol, and sandbox inputs as hostile.
- Keep agent operations observable and adjustable by humans.
- Remove obsolete APIs and update callers unless compatibility is explicitly required.
- Explain and obtain approval before adding a production dependency.
- Do not modify a quality gate, suppression, test, or health floor merely to make a change pass.

For Workhorse TypeScript, use Bun for package management and scripts, Effect for effects, Vitest for tests, Oxlint with the vendored anti-slop rules, and Fallow for repository health.

## Work

1. Trace the affected flow, callers, tests, trust boundaries, and invariants.
2. Reproduce bugs before fixing them and record the relevant baseline.
3. Make the smallest complete change at the shared cause.
4. Add a check that fails when the behavior regresses.
5. Run formatting, linting, compile or type checks, tests, and repository health checks.
6. Exercise external or user-visible behavior through its real runtime.
7. Review the final diff for accidental scope, stale paths, weakened types, and unexplained suppressions.

A change is complete only when every required gate passes and the claimed behavior works end to end. Report commands and actual results; anticipated results and substitute evidence do not count.
