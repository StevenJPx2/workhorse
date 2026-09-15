// Repo identity.
//
// A ticket's `repo` is stored as a clone URL (`fileTicket` normalizes
// `acme/widgets` to `https://github.com/acme/widgets.git`), but almost everything
// downstream wants `owner/name`: R2 dependency-cache keys, AI Search memory
// scopes, and GitHub API paths.
//
// This lives in the contract package because it is the one thing every plane
// agrees on — the name of a repository. It was previously exported from
// `@workhorse/knowledge`, which made `@workhorse/sandbox` depend on a PLUGIN to
// build a cache key.

/**
 * Normalize any spelling of a repo to a stable `owner/name` slug.
 *
 * `git@github.com:acme/x.git`, `https://github.com/acme/x`, and `acme/x` all
 * resolve to `acme/x`, so a run does not lose its repo's memories or cache
 * because the clone URL was spelled differently.
 *
 * A non-GitHub input keeps its shape with unsafe characters replaced, so it
 * stays usable as a key without silently colliding with a GitHub slug.
 */
export function repoSlug(repo: string): string {
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return m ? `${m[1]}/${m[2]}` : repo.replace(/[^a-zA-Z0-9_/-]/g, "_");
}
