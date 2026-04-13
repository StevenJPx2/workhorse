/**
 * Detect the rig (repository) from git remote URL
 *
 * A "rig" is identified by the git remote URL, normalized to format:
 * github.com/user/repo (or gitlab.com/user/repo, etc.)
 */

import { $ } from "bun";

export interface RigInfo {
  /** Normalized rig identifier (e.g., "github.com/user/repo") */
  rig: string;
  /** Git root directory path */
  gitRoot: string;
  /** Raw remote URL */
  remoteUrl: string;
}

/**
 * Normalize a git remote URL to a consistent format
 *
 * Handles:
 * - git@github.com:user/repo.git → github.com/user/repo
 * - https://github.com/user/repo.git → github.com/user/repo
 * - https://github.com/user/repo → github.com/user/repo
 * - ssh://git@github.com/user/repo.git → github.com/user/repo
 */
export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();

  // Remove .git suffix
  if (normalized.endsWith(".git")) {
    normalized = normalized.slice(0, -4);
  }

  // Handle SSH format: git@github.com:user/repo
  if (normalized.startsWith("git@")) {
    normalized = normalized.replace(/^git@/, "").replace(":", "/");
  }

  // Handle ssh:// format: ssh://git@github.com/user/repo
  if (normalized.startsWith("ssh://")) {
    normalized = normalized.replace(/^ssh:\/\//, "").replace(/^git@/, "");
  }

  // Handle https:// format
  if (normalized.startsWith("https://")) {
    normalized = normalized.replace(/^https:\/\//, "");
  }

  // Handle http:// format
  if (normalized.startsWith("http://")) {
    normalized = normalized.replace(/^http:\/\//, "");
  }

  return normalized;
}

/**
 * Get the git root directory of the current working directory
 */
export async function getGitRoot(cwd?: string): Promise<string | null> {
  try {
    const result = await $`git rev-parse --show-toplevel`.cwd(cwd ?? process.cwd()).quiet();
    return result.text().trim();
  } catch {
    return null;
  }
}

/**
 * Get the remote URL for a git repository
 */
export async function getRemoteUrl(
  cwd?: string,
  remoteName: string = "origin",
): Promise<string | null> {
  try {
    const result = await $`git remote get-url ${remoteName}`.cwd(cwd ?? process.cwd()).quiet();
    return result.text().trim();
  } catch {
    return null;
  }
}

/**
 * Detect the rig from the current directory
 *
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns RigInfo if in a git repo with a remote, null otherwise
 */
export async function detectRig(cwd?: string): Promise<RigInfo | null> {
  const gitRoot = await getGitRoot(cwd);
  if (!gitRoot) {
    return null;
  }

  const remoteUrl = await getRemoteUrl(gitRoot);
  if (!remoteUrl) {
    return null;
  }

  const rig = normalizeRemoteUrl(remoteUrl);

  return {
    rig,
    gitRoot,
    remoteUrl,
  };
}
