import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** The site's package folder. */
export const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** VitePress reads pages from here: the hub's own, and each project's pulled under its id. */
export const SRC = join(SITE, "src")

/** Each project's clone, kept so links to its code can be checked. */
export const SOURCES = join(SITE, ".sources")

export const MANIFEST = join(SOURCES, "pages.json")

/** One pulled page: where it sits on the site, and where it came from in its project. */
export type Pulled = {
  project: string
  /** Relative to `src/`, such as `atelier/docs/plans/index.md`. */
  page: string
  /** Relative to the project's root, such as `docs/plans/README.md`. */
  source: string
}
