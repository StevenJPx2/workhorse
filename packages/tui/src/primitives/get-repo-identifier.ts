import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Get the git remote origin URL for a repository.
 * Returns the raw remote URL, or undefined if not a git repo or no remote configured.
 */
export async function getRepoIdentifier(repoPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync("git remote get-url origin", { cwd: repoPath });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
