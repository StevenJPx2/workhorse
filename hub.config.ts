/**
 * Every repository the hub names: the projects whose docs it pulls and the
 * archived ones it lists as history. Nothing else holds an owner or a branch.
 * The move to the `wrkhse` organisation changes `owner` alone.
 */
const owner = "StevenJPx2"

export type Project = {
  /** The project's path on the site, such as `/atelier/`. */
  id: string
  name: string
  /** `owner/name` on GitHub. */
  repo: string
  /** The branch the hub pulls, and that its links to code point at. */
  branch: string
  summary: string
  /** Markdown files to pull, as globs from the repository's root. */
  pages: string[]
  /** Globs left out of `pages`. */
  exclude: string[]
  /** The plan issue, linked from the roadmap and the deck. */
  plan?: number
}

export type Archived = {
  repo: string
  summary: string
}

const hidden = [".*/**", "**/node_modules/**", "**/target/**", "mutants.out*/**"]

export const hub = {
  /** This repository: it builds the hub and is pulled from its own checkout. */
  repo: `${owner}/workhorse`,
  site: "https://workhorse-docs.stevenjpx2.workers.dev",
  projects: [
    {
      id: "workhorse",
      name: "Workhorse",
      repo: `${owner}/workhorse`,
      branch: "main",
      summary: "Open protocols in three layers: trust, runtime and harness",
      pages: ["README.md", "OVERVIEW.md", "PHILOSOPHY.md", "ARCHITECTURE.md", "modules/*.md"],
      exclude: [],
    },
    {
      id: "atelier",
      name: "atelier",
      repo: `${owner}/atelier`,
      branch: "main",
      summary: "A personal software factory: a labelled issue becomes a proven pull request",
      pages: ["**/*.md"],
      exclude: hidden,
      plan: 1,
    },
    {
      id: "rungs",
      name: "rungs",
      repo: `${owner}/rungs`,
      branch: "main",
      summary: "A small, proven step machine: no_std, no alloc, no dependencies",
      pages: ["README.md"],
      exclude: [],
      plan: 1,
    },
    {
      id: "sourcefed",
      name: "sourcefed",
      repo: `${owner}/sourcefed`,
      branch: "main",
      summary: "Tells agents and programs what changed in GitHub, Jira, Slack, feeds and schedules",
      pages: ["README.md", "docs/**/*.md"],
      exclude: [],
      plan: 3,
    },
    {
      id: "chauffeur",
      name: "Chauffeur",
      repo: `${owner}/chauffeur`,
      branch: "v2",
      summary: "Enhances a coding agent's context as it works: sense, classify, act",
      pages: ["**/*.md"],
      exclude: hidden,
    },
    {
      id: "tack",
      name: "tack",
      repo: "wrkhse/tack",
      branch: "main",
      summary: "Write a coding-agent plugin once and run it in every agent",
      pages: ["**/*.md"],
      exclude: hidden,
    },
  ] satisfies Project[],
  history: [
    {
      repo: "wrkhse/daemon-v0",
      summary: "The capability daemon and its spikes, as of 2026-10-30",
    },
    {
      repo: "wrkhse/fleet-v0",
      summary: "The autonomous coding fleet on Cloudflare, as of 2026-09-15",
    },
    {
      repo: "wrkhse/workhorse-legacy",
      summary: "The original command-line and terminal UI tool, as of 2026-07-14",
    },
  ] satisfies Archived[],
}

export const github = (repo: string) => `https://github.com/${repo}`
