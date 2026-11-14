# The wrkhse organization

Every project lives in the GitHub organization
[`wrkhse`](https://github.com/wrkhse). atelier, rungs, sourcefed, Chauffeur
and Workhorse were transferred there from `StevenJPx2`, with their issues,
pull requests and releases, and GitHub redirects their former addresses.

| Project | Repository | Former address |
| --- | --- | --- |
| Workhorse | [`wrkhse/workhorse`](https://github.com/wrkhse/workhorse) | `StevenJPx2/workhorse` |
| atelier | [`wrkhse/atelier`](https://github.com/wrkhse/atelier) | `StevenJPx2/atelier` |
| rungs | [`wrkhse/rungs`](https://github.com/wrkhse/rungs) | `StevenJPx2/rungs` |
| sourcefed | [`wrkhse/sourcefed`](https://github.com/wrkhse/sourcefed) | `StevenJPx2/sourcefed` |
| Chauffeur | [`wrkhse/chauffeur`](https://github.com/wrkhse/chauffeur) | `StevenJPx2/chauffeur` |
| tack | [`wrkhse/tack`](https://github.com/wrkhse/tack) | none |
| History | `wrkhse/daemon-v0`, `wrkhse/fleet-v0`, `wrkhse/workhorse-legacy`, archived | none |

## Links that name the former owner

[`hub.config.ts`](https://github.com/wrkhse/workhorse/blob/main/hub.config.ts)
names every repository from one `owner`, and lists the owners the projects
came from:

```ts
const owner = "wrkhse"

export const hub = {
  repo: `${owner}/workhorse`,
  formerOwners: ["StevenJPx2"],
  …
}
```

A GitHub link in a project's docs reaches the same project under either
owner. A link to a page the hub pulled stays on the site, and any other goes
to GitHub, which redirects it:

| Link in a project's docs | On the hub |
| --- | --- |
| `github.com/StevenJPx2/sourcefed/blob/main/docs/scriptc.md` | `/sourcefed/docs/scriptc` |
| `github.com/wrkhse/sourcefed/blob/main/docs/scriptc.md` | `/sourcefed/docs/scriptc` |
| `github.com/StevenJPx2/sourcefed/blob/main/src/index.ts` | unchanged, to GitHub |
