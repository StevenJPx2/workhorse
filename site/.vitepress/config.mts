import { existsSync, readFileSync } from "node:fs"
import { join, posix } from "node:path"
import { defineConfig, type DefaultTheme } from "vitepress"
import { github, hub, type Project } from "../../hub.config"
import { address, linker } from "./links"
import { MANIFEST, SITE, SRC, type Pulled } from "./sources"

if (!existsSync(MANIFEST)) throw new Error("No pulled pages: run `bun run pull` first.")
const pulled: Pulled[] = JSON.parse(readFileSync(MANIFEST, "utf8"))
const links = linker(pulled)
const HUB_BRANCH = hub.projects.find((project) => project.repo === hub.repo)?.branch ?? "main"

function title(page: string): string {
  const heading = readFileSync(join(SRC, page), "utf8").match(/^# (.+)$/m)?.[1]
  return heading?.replaceAll("`", "") ?? posix.basename(page, ".md")
}

/**
 * Pages sit in groups by folder: the top one, or two under `docs/`, such as
 * `crates` or `docs/plans`. A folder's index is its group's own page.
 */
function group(source: string): string {
  const parts = posix.dirname(source).split("/")
  return parts[0] === "docs" && parts.length > 1 ? parts.slice(0, 2).join("/") : (parts[0] ?? ".")
}

function projectSidebar(project: Project): DefaultTheme.SidebarItem[] {
  const pages = pulled.filter((entry) => entry.project === project.id)
  const item = (entry: Pulled) => ({ text: title(entry.page), link: address(entry.page) })
  const top = pages.filter((entry) => group(entry.source) === ".")
  const folders = [...new Set(pages.map((entry) => group(entry.source)))].filter((name) => name !== ".").toSorted()
  return [
    { text: project.name, items: top.toSorted((a) => (a.source === "README.md" ? -1 : 1)).map(item) },
    ...folders.map((folder) => {
      const index = pages.find((entry) => entry.source === `${folder}/README.md`)
      const items = pages.filter((entry) => group(entry.source) === folder && entry !== index)
      const labels = items.map((entry) => title(entry.page))
      // Two pages with one title, such as several crates' READMEs, say where they are.
      const named = items.map((entry, at) =>
        labels.filter((label) => label === labels[at]).length > 1
          ? { text: `${labels[at]} · ${posix.dirname(entry.source).slice(folder.length + 1) || folder}`, link: address(entry.page) }
          : item(entry),
      )
      return { text: folder, collapsed: true, ...(index && { link: address(index.page) }), items: named }
    }),
  ]
}

const deck = { text: "Deck", link: "/deck/", target: "_self" }

const hubSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: "The hub",
    items: [
      { text: "What's here and why", link: "/" },
      { text: "How the projects connect", link: "/connections" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "The move to wrkhse", link: "/wrkhse" },
      deck,
    ],
  },
  { text: "Projects", items: hub.projects.map((project) => ({ text: project.name, link: `/${project.id}/` })) },
  { text: "History", items: hub.history.map((archived) => ({ text: archived.repo, link: github(archived.repo) })) },
]

export default defineConfig({
  title: "Workhorse",
  description: "A family of projects for safe, steerable, observable coding agents",
  srcDir: SRC,
  cleanUrls: true,
  // The deck is built beside the site, so the build cannot see its pages.
  ignoreDeadLinks: [/^\/deck\//],
  vite: {
    resolve: { alias: [{ find: /^vue(?=$|\/)/, replacement: join(SITE, "node_modules/vue") }] },
    // Mermaid 12 bundles ELK as one 1.6 MB chunk. It loads only for a diagram
    // laid out with ELK, and the theme lays every diagram out with dagre.
    build: { chunkSizeWarningLimit: 1600 },
  },
  themeConfig: {
    nav: [
      { text: "Connections", link: "/connections" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "Projects", items: hub.projects.map((project) => ({ text: project.name, link: `/${project.id}/` })) },
      deck,
    ],
    sidebar: {
      ...Object.fromEntries(hub.projects.map((project) => [`/${project.id}/`, projectSidebar(project)])),
      "/": hubSidebar,
    },
    outline: [2, 3],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: github(hub.repo) }],
    // The pattern runs in the browser, so it reads what transformPageData wrote.
    editLink: { pattern: ({ frontmatter }) => String(frontmatter.edit) },
  },
  transformPageData(page) {
    const project = links.project(page.relativePath)
    const source = links.source(page.relativePath)
    page.frontmatter.edit =
      project && source
        ? `${github(project.repo)}/edit/${project.branch}/${source.source}`
        : `${github(hub.repo)}/edit/${HUB_BRANCH}/site/src/${page.relativePath}`
  },
  markdown: {
    config(md) {
      const fence = md.renderer.rules.fence
      md.renderer.rules.fence = (tokens, at, options, env, self) => {
        const token = tokens[at]
        if (token?.info.trim() !== "mermaid") return fence?.(tokens, at, options, env, self) ?? ""
        // v-pre keeps Vue from reading {{ }} in a diagram as a template.
        return `<pre class="mermaid" v-pre>${md.utils.escapeHtml(token.content)}</pre>`
      }
      md.core.ruler.push("project-links", (state) => {
        const page = state.env.relativePath as string | undefined
        if (!page) return
        for (const token of state.tokens.flatMap((block) => block.children ?? [])) {
          if (token.type === "link_open") token.attrSet("href", links.link(token.attrGet("href") ?? "", page))
          if (token.type === "image") token.attrSet("src", links.image(token.attrGet("src") ?? "", page))
        }
      })
    },
  },
})
