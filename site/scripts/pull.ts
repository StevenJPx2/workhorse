import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, posix, resolve } from "node:path"
import { Glob } from "bun"
import { hub, type Project } from "../../hub.config"
import { SITE, SOURCES, SRC, MANIFEST, type Pulled } from "../.vitepress/sources"

const ROOT = resolve(SITE, "..")

/** Files no reader of the site needs, wherever a project keeps them. */
const NEVER = ["**/AGENTS.md", "**/CLAUDE.md"]

/** A shallow clone of the project's branch, or this checkout for the hub itself. */
function checkout(project: Project): string {
  if (project.repo === hub.repo) return ROOT
  const into = join(SOURCES, project.id)
  rmSync(into, { recursive: true, force: true })
  const clone = Bun.spawnSync(
    ["git", "clone", "--quiet", "--depth", "1", "--branch", project.branch, `https://github.com/${project.repo}.git`, into],
    { stderr: "pipe" },
  )
  if (!clone.success) throw new Error(`${project.repo}@${project.branch}: ${clone.stderr.toString().trim()}`)
  return into
}

function matching(root: string, project: Project): string[] {
  const excluded = [...project.exclude, ...NEVER].map((pattern) => new Glob(pattern))
  const found = project.pages.flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd: root, dot: false })])
  return [...new Set(found)].filter((file) => !excluded.some((glob) => glob.match(file))).toSorted()
}

/** A folder's `README.md` is its index page, so a link to the folder lands on it. */
const sitePath = (source: string) => source.replace(/(^|\/)README\.md$/, "$1index.md")

/**
 * Relative media in a page: Markdown images, and HTML images and videos,
 * which the build bundles and so must find beside the page.
 */
function images(markdown: string): string[] {
  const markdownImages = [...markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)]
  const htmlImages = [...markdown.matchAll(/<(?:img|video|source)\b[^>]*\bsrc=["']([^"']+)["']/g)]
  return [...markdownImages, ...htmlImages]
    .map((match) => decodeURI(match[1] ?? "").split("#")[0] ?? "")
    .filter((src) => src !== "" && !/^([a-z]+:|\/)/i.test(src))
}

function pull(project: Project): Pulled[] {
  const root = checkout(project)
  const into = join(SRC, project.id)
  rmSync(into, { recursive: true, force: true })
  return matching(root, project).map((source) => {
    const page = posix.join(project.id, sitePath(source))
    const markdown = readFileSync(join(root, source), "utf8")
    mkdirSync(dirname(join(SRC, page)), { recursive: true })
    writeFileSync(join(SRC, page), markdown)
    for (const image of images(markdown)) {
      const from = posix.join(posix.dirname(source), image)
      if (from.startsWith("..") || !existsSync(join(root, from))) continue
      cpSync(join(root, from), join(into, from))
    }
    return { project: project.id, page, source }
  })
}

const pulled = hub.projects.flatMap((project) => {
  const pages = pull(project)
  console.log(`${project.repo}@${project.branch}: ${pages.length} pages`)
  return pages
})
mkdirSync(SOURCES, { recursive: true })
writeFileSync(MANIFEST, `${JSON.stringify(pulled, null, 2)}\n`)
