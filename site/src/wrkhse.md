# The move to wrkhse

The projects move to the GitHub organisation
[`wrkhse`](https://github.com/wrkhse) once their current slices finish:
atelier, rungs, sourcefed, Chauffeur and Workhorse. tack and the archived
versions of Workhorse are there already.

| Repository | Now | After the move |
| --- | --- | --- |
| Workhorse | `StevenJPx2/workhorse` | `wrkhse/workhorse` |
| atelier | `StevenJPx2/atelier` | `wrkhse/atelier` |
| rungs | `StevenJPx2/rungs` | `wrkhse/rungs` |
| sourcefed | `StevenJPx2/sourcefed` | `wrkhse/sourcefed` |
| Chauffeur | `StevenJPx2/chauffeur` | `wrkhse/chauffeur` |
| tack | `wrkhse/tack` | `wrkhse/tack` |
| History | `wrkhse/daemon-v0`, `wrkhse/fleet-v0`, `wrkhse/workhorse-legacy`, archived | unchanged |

## What changes in the hub

One line. [`hub.config.ts`](https://github.com/StevenJPx2/workhorse/blob/main/hub.config.ts)
names every repository from one `owner`:

```ts
const owner = "wrkhse"
```

The next build pulls each project from its new home, and every link to its
code, plan and edit page follows. GitHub redirects the old addresses, so
links inside the projects' own docs keep working until each is updated.

## What each project does

- Transfer the repository in GitHub's settings, which keeps its issues,
  pull requests, releases and stars.
- Point its own links, badges, package metadata and Homebrew formula at the
  new owner.
- Move its repository secrets, such as `CLOUDFLARE_API_TOKEN`, which a
  transfer does not carry.
