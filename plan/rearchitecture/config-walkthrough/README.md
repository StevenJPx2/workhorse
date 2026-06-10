# Workhorse Config — a Quick Walkthrough

This folder is a **worked example**, not live config. It shows what a user
actually creates on disk and what authoring feels like. Everything under
`.workhorse/` here is what would normally live in a real repo's `.workhorse/`.

## The 30-Second Mental Model

A **workflow** is an assembly line with a few **stages**:

```
planning ──▶ implementing ──▶ ready_for_review ──▶ in_review ──▶ done
```

- Each stage runs its **steps** in order, then loops back to the top of that
  stage — until a **rule** moves us to another stage.
- A rule reads like English: **`when <something>, to <stage>`**. First match wins.
- If no rule matches, the stage just keeps looping (or quietly waits, for a
  review stage). Steps never decide routing — only stages have rules, and a
  rule only ever switches stages.

That is the whole control flow. Nothing else routes.

## The Files

```
.workhorse/
├─ config.toml            ← project defaults + preset patches
├─ workflows/
│  └─ ralph.toml          ← the assembly line (stages + steps)
└─ presets/               ← reusable "job descriptions" for steps
   ├─ prompt.toml
   ├─ planning.toml
   ├─ coding.toml
   ├─ memory.toml
   ├─ verify.toml
   └─ review-monitor.toml
```

A global `~/.config/workhorse/config.toml` can hold your personal defaults; the
project `config.toml` overrides it.

### 1. `workflows/ralph.toml` — The Assembly Line

The top half is the **stages** (the machine). The bottom half is the **steps**,
and each step is just "use this preset, with these tweaks."

Read a rule out loud:

> `{ when = "todos_complete", to = "implementing" }`
> _"When the todos are complete, move to implementing."_

### 2. `presets/coding.toml` — A Reusable Step

A preset is a step's job description: its prompts, its allowed tools, its
budget. Write it once; any workflow can use it. A preset does **not** say which
stage it runs in — the workflow decides that by listing the step under a stage.

### 3. `config.toml` — Defaults & Overrides

Two things:

- `[defaults]` — what every step starts from.
- `[presets.coding]` — a repo-wide patch: _"here, the coder uses Codex."_ Retune
  a preset for this repo without editing `presets/coding.toml`.

> Agents (and tools, skills, services) aren't _defined_ here — they're registered
> in code or by plugins. Config only **references** them by name (`agent = "claude"`,
> a step's `tools`/`services`), and the resolver checks those names at load.

## How One Setting Is Decided (Layering)

Settings stack; **last wins, most-specific wins**. The coder's `agent`:

```
defaults.agent          = "claude"   (config.toml)
preset coding.agent     = (unset)    (presets/coding.toml)
project patch           = "codex"    (config.toml → [presets.coding])
step override           = (unset)    (ralph.toml → [steps.coder])
─────────────────────────────────────
coder runs on             "codex"
```

The coder's `token_budget`:

```
defaults                = 100_000
preset coding           = 100_000
step override (ralph)   = 150_000   ← wins
─────────────────────────────────────
                          150_000
```

## The Rule Language (`when`)

A rule is a tiny, safe expression — never code:

| You write                      | Means                             |
| ------------------------------ | --------------------------------- |
| `todos_complete`               | a built-in check                  |
| `git_clean`                    | the working tree is clean         |
| `todo_count == 0`              | compare a known value             |
| `checks_status != "passed"`    | …with text                        |
| `todos_complete and git_clean` | combine with `and` / `or` / `not` |
| `file_exists("PLAN.md")`       | does a file exist                 |
| `branch matches "^feat/"`      | text pattern match                |

The names (`todos_complete`, `git_clean`, …) are a fixed set owned by the core,
so a typo is caught the moment the workflow loads.
