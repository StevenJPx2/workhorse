import { existsSync, statSync } from "node:fs"
import { join, posix, resolve } from "node:path"
import { github, hub, type Project } from "../../hub.config"
import { SITE, SOURCES, SRC, type Pulled } from "./sources"

/** Where a project's files are on disk: this checkout for the hub, its clone for the rest. */
export const rootOf = (project: Project) =>
  project.repo === hub.repo ? resolve(SITE, "..") : join(SOURCES, project.id)

/** A page's address on the site, such as `/atelier/docs/plans/`. */
export const address = (page: string) => `/${page.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "")}`

const GITHUB = /^https:\/\/github\.com\/([^/]+\/[^/#?]+)\/(?:blob|tree)\/[^/]+\/([^#?]+)(#.*)?$/i

/**
 * Rewrites the links of pulled pages. A link to a page the hub pulled, whether
 * relative or to it on GitHub, stays on the site; a relative link to anything
 * else, such as code or a folder, goes to that file on GitHub at the branch
 * the hub pulls. The hub's own pages keep their links.
 */
export function linker(pulled: Pulled[]) {
  const byPage = new Map(pulled.map((entry) => [entry.page, entry]))
  const bySource = new Map(pulled.map((entry) => [`${entry.project}:${entry.source}`, entry]))
  const projects = new Map(hub.projects.map((project) => [project.id, project]))

  const onSite = (project: Project, source: string) =>
    bySource.get(`${project.id}:${source}`) ?? bySource.get(`${project.id}:${posix.join(source, "README.md")}`)

  function fromGitHub(href: string): string {
    const [, repo = "", path = "", hash = ""] = href.match(GITHUB) ?? []
    const project = hub.projects.find((candidate) => candidate.repo.toLowerCase() === repo.toLowerCase())
    const found = project && onSite(project, path.replace(/\/$/, ""))
    return found ? address(found.page) + hash : href
  }

  function relative(href: string, entry: Pulled, project: Project): string {
    const [path = "", hash] = href.split("#")
    const target = posix.normalize(posix.join(posix.dirname(entry.source), decodeURI(path))).replace(/\/$/, "")
    const anchor = hash === undefined ? "" : `#${hash}`
    const found = onSite(project, target)
    if (found) return address(found.page) + anchor
    if (target.startsWith("..")) return github(project.repo)
    const local = join(rootOf(project), target)
    const kind = existsSync(local) && statSync(local).isDirectory() ? "tree" : "blob"
    return `${github(project.repo)}/${kind}/${project.branch}/${target}${anchor}`
  }

  return {
    /** The project a page was pulled from, if it was. */
    project(page: string): Project | undefined {
      const entry = byPage.get(page)
      return entry && projects.get(entry.project)
    },
    source(page: string): Pulled | undefined {
      return byPage.get(page)
    },
    link(href: string, page: string): string {
      const entry = byPage.get(page)
      const project = entry && projects.get(entry.project)
      if (!entry || !project) return href
      if (/^https?:/i.test(href)) return fromGitHub(href)
      if (/^([a-z]+:|#|\/)/i.test(href)) return href
      return relative(href, entry, project)
    },
    /** An image the pull could not copy is read from GitHub, so the build never fails on it. */
    image(src: string, page: string): string {
      const entry = byPage.get(page)
      const project = entry && projects.get(entry.project)
      if (!entry || !project || /^([a-z]+:|\/)/i.test(src)) return src
      if (existsSync(join(SRC, posix.dirname(page), decodeURI(src)))) return src
      const target = posix.normalize(posix.join(posix.dirname(entry.source), decodeURI(src)))
      return `https://raw.githubusercontent.com/${project.repo}/${project.branch}/${target}`
    },
  }
}
