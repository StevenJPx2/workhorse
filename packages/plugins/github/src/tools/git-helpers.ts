/**
 * Git helper functions for GitHub tools.
 *
 * @module workhorse-plugin-github/tools/git-helpers
 */

/** Result of a git operation */
export type GitResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parse owner/repo from a GitHub remote URL */
export function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // Parse GitHub URL: https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const match =
    remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/) ??
    remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (match?.[1] && match[2]) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

/** Get owner/repo from git remote origin */
export async function getOwnerRepoFromRemote(
  cwd: string,
): Promise<GitResult<{ owner: string; repo: string }>> {
  const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return { ok: false, error: "Could not get git remote URL" };
  }

  const parsed = parseGitHubRemote(out.trim());
  if (!parsed) {
    return { ok: false, error: "Could not parse GitHub owner/repo from remote URL" };
  }

  return { ok: true, value: parsed };
}

/** Get the current branch name */
export async function getCurrentBranch(cwd: string): Promise<GitResult<string>> {
  const proc = Bun.spawn(["git", "branch", "--show-current"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return { ok: false, error: `Failed to get current branch: ${err || out}` };
  }

  return { ok: true, value: out.trim() };
}

/** Push branch to origin with upstream tracking */
export async function pushBranch(cwd: string, branch: string): Promise<GitResult<void>> {
  const proc = Bun.spawn(["git", "push", "-u", "origin", branch], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [, err, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0 && !err.includes("Everything up-to-date")) {
    return { ok: false, error: `Failed to push branch: ${err}` };
  }

  return { ok: true, value: undefined };
}
