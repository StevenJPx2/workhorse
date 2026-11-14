import { describe, expect, test } from "bun:test"
import { hub } from "../../hub.config"
import { linker } from "./links"

const readme = { project: "sourcefed", page: "sourcefed/index.md", source: "README.md" }
const daemon = { project: "sourcefed", page: "sourcefed/docs/daemon.md", source: "docs/daemon.md" }
const links = linker([readme, daemon])

describe("a GitHub link in a pulled page", () => {
  test("to a pulled page under the project's owner stays on the site", () => {
    const repo = hub.projects.find((project) => project.id === "sourcefed")?.repo
    const href = `https://github.com/${repo}/blob/main/docs/daemon.md#rpc`

    expect(links.link(href, readme.page)).toBe("/sourcefed/docs/daemon#rpc")
  })

  test("to a pulled page under a former owner stays on the site", () => {
    const href = "https://github.com/StevenJPx2/sourcefed/blob/main/docs/daemon.md#rpc"

    expect(links.link(href, readme.page)).toBe("/sourcefed/docs/daemon#rpc")
  })

  test("to a file the hub did not pull goes to GitHub", () => {
    const href = "https://github.com/StevenJPx2/sourcefed/blob/main/src/daemon.ts"

    expect(links.link(href, readme.page)).toBe(href)
  })

  test("to the same name under another owner goes to GitHub", () => {
    const href = "https://github.com/someone/sourcefed/blob/main/docs/daemon.md"

    expect(links.link(href, readme.page)).toBe(href)
  })
})
