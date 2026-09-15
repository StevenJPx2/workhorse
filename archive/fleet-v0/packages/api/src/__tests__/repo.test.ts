// Repo identity.
//
// These moved here with `repoSlug` itself, which used to live in
// @workhorse/knowledge — a plugin that @workhorse/sandbox then had to depend on
// just to build a dependency-cache key.

import { describe, expect, it } from "vitest";
import { repoSlug } from "../repo";

describe("repoSlug", () => {
  it("normalizes every spelling of the same GitHub repo", () => {
    // A run must not lose its repo's memories or dependency cache because the
    // clone URL was written differently.
    for (const spelling of [
      "https://github.com/acme/widgets.git",
      "https://github.com/acme/widgets",
      "git@github.com:acme/widgets.git",
      "acme/widgets",
    ]) {
      expect(repoSlug(spelling)).toBe("acme/widgets");
    }
  });

  it("normalizes the shape fileTicket actually stores", () => {
    // fileTicket rewrites `acme/x` to a clone URL, so this — not the bare slug —
    // is what every downstream consumer receives from ctx.ticket.repo.
    expect(repoSlug("https://github.com/acme/widgets.git")).toBe("acme/widgets");
  });

  it("sanitizes a non-GitHub identifier rather than dropping it", () => {
    expect(repoSlug("https://gitlab.com/acme/x.git")).not.toContain(":");
    expect(repoSlug("weird name!")).toBe("weird_name_");
  });

  it("is idempotent", () => {
    // Called on both an explicit arg and ctx.ticket.repo, so double application
    // must not change the result.
    const once = repoSlug("git@github.com:acme/widgets.git");

    expect(repoSlug(once)).toBe(once);
  });

  it("keeps a slug usable as a storage key", () => {
    // The slug is a path segment in R2 keys (`depcache/<slug>/…`) and AI Search
    // filenames (`mem/<slug>/…`), so a stray colon or space would corrupt them.
    for (const input of ["weird name!", "https://gitlab.com/a/b.git", "acme/x"]) {
      expect(repoSlug(input)).toMatch(/^[\w./-]+$/);
    }
  });
});
