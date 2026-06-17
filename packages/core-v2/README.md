# core-v2

Workhorse is an SDK for **controllable, automated coding agents**. `core-v2` is
the from‑scratch rearchitecture of that engine.

This README is the plain‑English tour. The authoritative spec is
[`plan/rearchitecture/rearchitecture.md`](../../plan/rearchitecture/rearchitecture.md);
jump to [Commands](#commands) to run something.

## The big idea

You hand the system a **ticket** (a Jira/GitHub issue). It runs a **robot worker**
(an _Agent_) that walks through a series of **rooms** until the job is done.
Everything else is just detail about _who runs the robot, which rooms exist, and
which gadgets the robot is allowed to hold._

## The cast

- 🤖 **Robot = Agent.** "Just bones": it can only **work**, **listen** (you can
  poke it mid‑task), and **stop**. It has no skills of its own — you hand it a
  toolbelt each time.
- 🧰 **Gadgets = tools / skills / scripts.** Read a file, write a file, run git,
  search the repo, run a saved script. The robot can only use what's on its belt
  right now.
- 🏠 **Rooms = stages**, named after the job's status:
  `planning → implementing → ready_for_review → in_review → done`. Each room has a
  small **to‑do list of chores** it runs in order, then loops back to the top.
- ✅ **Chores = steps** ("make a plan", "write code", "save memory"). **Each chore
  starts a brand‑new robot with a blank brain** — the only thing it inherits is a
  **sticky note** from the previous chore (the _handoff_).
- 🚪 **Doors = `when` rules.** Each door has a sign: _"when the to‑dos are done →
  go to the Review room."_ First matching sign wins. **Only rooms have doors;
  individual chores never decide where to go next.**
- 👷 **Supervisor = Harness.** It actually _runs_ each robot: clips on the right
  toolbelt, starts a **timer**, **trims** giant tool output, and only ever stops
  the robot **between chores, never mid‑chore** — so you never get a half‑written
  file or half a commit.

## The one rule that explains everything

> **The rulebook only allows; it never provides.**

There are two separate worlds:

1. 📜 **The rulebook (config)** — plain text files on disk (TOML). It describes the
   rooms, the doors, and _which gadgets are allowed_ for each chore. It lists
   gadgets **by name** and says yes/no — it holds **zero actual gadgets**. The
   robot **can't edit the rulebook** (it's read‑only, and frozen when the ticket
   starts), so a coding agent can't rewrite the rules it's judged by. 🔒
2. ⚙️ **The real stuff (runtime)** — the live robot and the actual gadgets, which
   come from **code and plugins**, never from the rulebook.

So "what does this robot get to hold?" = **(everything its robot‑type owns +
everything the appliances offer) narrowed to the chore's allow‑list.** Like a
bouncer with a guest list: most‑restrictive wins.

## 🔌 Services = the building's appliances (sharing the same outlets)

A Service is a **sealed appliance**, not a generic helper:

- **Each is a self‑contained box with its own guts.** You use it through a simple
  face and don't care how it works inside. The _scripts_ appliance keeps scripts
  in a drawer (saved to disk, read back); the _skills_ appliance is a shelf of
  instruction cards; the _memory_ appliance (L1) is a notebook it writes and
  periodically tidies; the _search_ appliance (L2) is a card catalog (BM25 +
  vectors). Same idea, totally different internals — **each owns its own
  mechanism.**
- **Some dispense, some do real work.** The tools/skills/scripts appliances _hand
  gadgets to the belt_. The _git_ appliance actually commits and pushes; the _AST_
  appliance does precision renames; the _agent_ appliance builds more robots.
  Several are the muscle, not just vending machines.
- **You can unplug one and run it anywhere.** An appliance isn't welded to the
  building — grab just the "drive‑a‑robot" appliance + the "tools" appliance, plug
  them into a different kitchen, and they work on their own with none of the rest
  of the factory. (This standalone composability is the whole reason Services are
  separate boxes.)

Every appliance plugs into the same **wall outlets** (a typed hook bus): it
announces _"I provide X"_ (`*:register`), and the supervisor reads the outlets to
assemble the belt.

## 🧩 Plugins = third‑party gadgets that fit the same outlets

A plugin is defined by _how it connects_:

- **Same outlets, no custom wiring.** A plugin contributes through the same bus, so
  to the robot a GitHub tool looks identical to a built‑in one.
- **Optional — core never depends on one.** They're the vendor‑made add‑ons
  (GitHub, Jira). Unplug them and nothing core breaks.
- **Can staple an extra chore to a room's doorway.** The GitHub gadget can, the
  moment the robot enters **review**, automatically file a pull request _before_
  that room's normal chores run (a "pre‑transition step").

In one line: **outlets (the bus) on every wall; appliances (services) are built‑in
and portable; plugins are other‑brand gadgets that fit the same plug — and core
never depends on them.**

## How a ticket flows

1. A ticket arrives → the building manager (**Orchestrator**) makes a fresh board
   and a private git worktree for it, so two tickets never trip over each other.
2. The robot enters **planning**, does its chores, leaving sticky notes between
   them.
3. A door fires: _plan done → implementing._
4. **implementing** loops: write code → save memory → write code… until _to‑dos
   done → ready_for_review._
5. Checks pass → **in_review**, which simply _waits for a human_ (a "park" room 🅿️).
6. Human signs off → 🎉 **done**. (`blocked` is the other park room — the robot
   waits there if it gets stuck until something outside nudges it.)

## Cheat‑sheet

| Plain English                              | Real thing                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Robot worker                               | **Agent** (`run` / `notify` / `interrupt`)                            |
| Gadgets on its belt                        | **tools / skills / scripts**                                          |
| Rooms                                      | **stages** (= statuses)                                              |
| Chores in a room                           | **steps**                                                            |
| Door signs                                 | **`when` exit rules** (only stages route)                            |
| Sticky note between chores                 | **prologue / epilogue** handoff                                      |
| Supervisor running the robot               | **Harness**                                                         |
| Rulebook (read‑only, on disk)              | **config plane** (TOML, snake_case)                                  |
| Live robot + real gadgets                  | **runtime plane**                                                    |
| Sealed appliance (own guts, portable)      | **Service** (Git, L1 memory, L2 search, Agent, AST, Tools/Skills/Scripts) |
| Wall outlets                               | **hook bus** (`*:register`)                                          |
| Unplug an appliance, run it elsewhere      | **standalone composition**                    |
| Other‑brand gadget in the same outlets     | **Plugin** (GitHub, Jira)                                            |
| Gadget that auto‑runs a chore on room entry | plugin‑injected **pre‑transition step**                              |
| Building manager                           | **Orchestrator** + GlobalContext                                    |
| A ticket's private board                   | **WorkflowContext** (one per run)                                   |

## Going deeper

- **Full spec (source of truth):** [`../../plan/rearchitecture/rearchitecture.md`](../../plan/rearchitecture/rearchitecture.md)
- **The config plane** (rooms, doors, presets, the `when` language): [`src/config/README.md`](src/config/README.md)
- **The service model** (the bus, contributions, `define*` wrappers): [`src/services/README.md`](src/services/README.md)

## Commands

Run from the repo root:

```bash
bun install

bunx vitest run packages/core-v2         # run this package's tests
bun run check                            # full gate: format → lint → typecheck → test → fallow

bun run --filter core-v2 smoke:config    # runnable demo: build + validate an example config
```

More runnable demos live in [`scripts/smoke/`](scripts/smoke/).
