import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, posix, resolve } from "node:path"
import { Glob } from "bun"
import { hub, type Project } from "../../hub.config"
import { SITE, SOURCES, SRC, MANIFEST, type Pulled } from "../.vitepress/sources"

const ROOT = resolve(SITE, "..")
const DECK = join(ROOT, "deck")

/** Files no reader of the site needs, wherever a project keeps them. */
const NEVER = ["**/AGENTS.md", "**/CLAUDE.md"]

const cloned = new Set<string>()

/**
 * A shallow clone of one of the project's branches, or this checkout for the
 * hub itself. The docs' branch is cloned into `.sources/<id>`, where links
 * to code are checked; any other into `.sources/<id>@<branch>`.
 */
function checkout(project: Project, branch = project.branch): string {
  if (project.repo === hub.repo) return ROOT
  const into = join(
    SOURCES,
    branch === project.branch ? project.id : `${project.id}@${branch}`,
  )
  if (cloned.has(into)) return into
  cloned.add(into)
  rmSync(into, { recursive: true, force: true })
  const clone = Bun.spawnSync(
    [
      "git",
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      branch,
      `https://github.com/${project.repo}.git`,
      into,
    ],
    { stderr: "pipe" },
  )
  if (!clone.success)
    throw new Error(`${project.repo}@${branch}: ${clone.stderr.toString().trim()}`)
  return into
}

function matching(root: string, project: Project): string[] {
  const excluded = [...project.exclude, ...NEVER].map((pattern) => new Glob(pattern))
  const found = project.pages.flatMap((pattern) => [
    ...new Glob(pattern).scanSync({ cwd: root, dot: false }),
  ])
  return [...new Set(found)]
    .filter((file) => !excluded.some((glob) => glob.match(file)))
    .toSorted()
}

/** A folder's `README.md` is its index page, so a link to the folder lands on it. */
const sitePath = (source: string) =>
  source.replace(/(^|\/)README\.md$/, "$1index.md")

/**
 * Relative media in a page: Markdown images, and HTML images and videos,
 * which the build bundles and so must find beside the page.
 */
function images(markdown: string): string[] {
  const markdownImages = [...markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)]
  const htmlImages = [
    ...markdown.matchAll(/<(?:img|video|source)\b[^>]*\bsrc=["']([^"']+)["']/g),
  ]
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

/**
 * Copies the recordings the deck shows, each named in `slides.md` as
 * `./media/<project>/<path in its repository>`, from the project's demo
 * branch. A recording that is gone fails the pull, so the deck never loses
 * one quietly.
 */
function pullDemos(): void {
  const slides = readFileSync(join(DECK, "slides.md"), "utf8")
  const wanted = [
    ...new Set(
      [...slides.matchAll(/\.\/media\/([\w-]+)\/([^)\s"']+)/g)].map(
        (match) => match[0],
      ),
    ),
  ]
  rmSync(join(DECK, "media"), { recursive: true, force: true })
  for (const reference of wanted) {
    const [, id = "", path = ""] =
      reference.match(/^\.\/media\/([\w-]+)\/(.+)$/) ?? []
    const project = hub.projects.find((candidate) => candidate.id === id)
    if (!project)
      throw new Error(
        `deck/slides.md: no project "${id}" in hub.config.ts, for ${reference}`,
      )
    if (
      path.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(
        `deck/slides.md: recording path must stay inside its project: ${reference}`,
      )
    }
    const branch = project.demos ?? project.branch
    const root = checkout(project, branch)
    if (!existsSync(join(root, path)))
      throw new Error(`deck/slides.md: ${project.repo}@${branch} has no ${path}`)
    cpSync(join(root, path), join(DECK, "media", id, path))
  }
  console.log(`deck: ${wanted.length} recordings`)
}

const pulled = hub.projects.flatMap((project) => {
  const pages = pull(project)
  console.log(`${project.repo}@${project.branch}: ${pages.length} pages`)
  return pages
})
mkdirSync(SOURCES, { recursive: true })
writeFileSync(MANIFEST, `${JSON.stringify(pulled, null, 2)}\n`)
pullDemos()
