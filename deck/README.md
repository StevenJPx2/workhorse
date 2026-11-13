# Presentation

A technical walkthrough of three everyday problems: the agent cannot hear
changes outside its harness, it strays from the user's instructions, and each
project repeats the same delivery process.

The story follows sourcefed, Chauffeur, then atelier. Eight recordings show
real behavior. The connections and Workhorse's purpose follow the demos; tack
and rungs sit in a separate technical appendix.

## Run

Install the existing dependencies in `site/` and `deck/`, then run:

```sh
cd deck
bun run dev
```

The dev command pulls the recordings before starting Slidev. To build the
whole hub and presentation, run `bun run build` in `site/`.

## Recordings

Each recording is referenced in `slides.md` at its path in its repository:

```md
![The agent fixes a CI failure](./media/sourcefed/docs/media/ci-failure.gif)
```

`site/scripts/pull.ts` copies those files from each project's configured
branch into the ignored `media/` directory. `hub.config.ts` keeps the branch
selection: Chauffeur's docs use `v2`, while its demo recordings use `main`
(v1). A missing recording fails the pull. No recordings are fabricated.

The `demo` layout puts the explanation next to its recording, mounts it
when the slide becomes active, and provides an **Enlarge recording** button.
The enlarged view closes with its button or Escape. Speaker notes hold
narration and demo qualifications.

- Sourcefed's GitHub activity is real; the failures and comments are staged,
  and waiting time is sped up.
- Chauffeur's recordings show v1 in OpenCode. The X CLI responses are fixtures.
  Its shell-write guard and permission decisions are real behavior.
- Atelier's recordings show issue claiming and gates. Pipelines and
  sourcefed-triggered runs are marked as next steps.
