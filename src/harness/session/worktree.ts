/**
 * Git worktree management for code isolation
 *
 * Each ticket gets its own worktree so agents can work independently
 * without conflicting with each other or the main repository.
 */

import { join, dirname, basename } from "node:path";

/**
 * Represents a git worktree
 */
export interface Worktree {
  path: string;
  branch: string;
  ticketId: string;
  head: string;
}

/**
 * Options for git commands
 */
interface GitCommandOptions {
  path?: string;
  branch?: string;
  newBranch?: boolean;
  force?: boolean;
  porcelain?: boolean;
}

/**
 * Issue type to branch prefix mapping
 */
const BRANCH_PREFIXES: Record<string, string> = {
  Story: "feat",
  Bug: "fix",
  Task: "chore",
  "Sub-task": "chore",
};

/**
 * Create the worktree path for a ticket
 * Path is: {repo}-worktrees/{ticketId}
 */
export function createWorktreePath(repoPath: string, ticketId: string): string {
  // Remove trailing slash from repo path
  const cleanRepoPath = repoPath.replace(/\/$/, "");

  // Sanitize ticket ID for filesystem
  const sanitizedTicketId = ticketId.replace(/[/:\.]/g, "-");

  // Create path in sibling directory
  const repoDir = dirname(cleanRepoPath);
  const repoName = basename(cleanRepoPath);

  return join(repoDir, `${repoName}-worktrees`, sanitizedTicketId);
}

/**
 * Create a branch name from a ticket ID and issue type
 */
export function createBranchName(ticketId: string, issueType?: string): string {
  const prefix = issueType ? BRANCH_PREFIXES[issueType] || "feat" : "feat";
  return `${prefix}/${ticketId}`;
}

/**
 * Extract ticket ID from worktree path
 */
function extractTicketIdFromPath(path: string, worktreeMarker: string): string {
  const idx = path.indexOf(worktreeMarker);
  if (idx === -1) return "";
  return path.slice(idx + worktreeMarker.length);
}

/**
 * Parse git worktree list --porcelain output
 */
export function parseWorktreeList(
  output: string,
  worktreeMarker: string
): Worktree[] {
  if (!output.trim()) {
    return [];
  }

  const worktrees: Worktree[] = [];
  const entries = output.trim().split("\n\n");

  for (const entry of entries) {
    if (!entry.trim()) continue;

    const lines = entry.split("\n");
    let path = "";
    let head = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice(9);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        // Format: branch refs/heads/branch-name
        branch = line.slice(7).replace("refs/heads/", "");
      }
    }

    // Only include worktrees in the jiratown worktrees directory
    if (path && path.includes(worktreeMarker)) {
      const ticketId = extractTicketIdFromPath(path, worktreeMarker);
      worktrees.push({
        path,
        branch,
        ticketId,
        head,
      });
    }
  }

  return worktrees;
}

/**
 * Build a git command array
 */
export function buildGitCommand(
  command: string,
  subcommand: string,
  options: GitCommandOptions
): string[] {
  const args: string[] = ["git", command, subcommand];

  switch (command) {
    case "worktree":
      if (subcommand === "add") {
        if (options.newBranch && options.branch) {
          args.push("-b", options.branch);
        }
        if (options.path) {
          args.push(options.path);
        }
        if (!options.newBranch && options.branch) {
          args.push(options.branch);
        }
      } else if (subcommand === "remove") {
        if (options.force) {
          args.push("--force");
        }
        if (options.path) {
          args.push(options.path);
        }
      } else if (subcommand === "list") {
        if (options.porcelain) {
          args.push("--porcelain");
        }
      }
      break;

    case "branch":
      if (options.branch) {
        args.push(options.branch);
      }
      break;

    case "fetch":
      // subcommand is the remote name
      break;
  }

  return args;
}

/**
 * Execute a git command and return the result
 */
async function execGit(
  args: string[],
  cwd?: string
): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: output.trim(),
      error: error.trim(),
    };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Create a new worktree for a ticket
 */
export async function createWorktree(
  repoPath: string,
  ticketId: string,
  issueType?: string,
  baseBranch: string = "main"
): Promise<Worktree | null> {
  const worktreePath = createWorktreePath(repoPath, ticketId);
  const branchName = createBranchName(ticketId, issueType);

  // First fetch to ensure we have latest
  await execGit(["git", "fetch", "origin"], repoPath);

  // Try to create with new branch
  const cmd = buildGitCommand("worktree", "add", {
    path: worktreePath,
    branch: branchName,
    newBranch: true,
  });

  // Add base branch to checkout from
  cmd.push(`origin/${baseBranch}`);

  const result = await execGit(cmd, repoPath);

  if (!result.success) {
    // Branch might already exist, try without -b
    const existingCmd = buildGitCommand("worktree", "add", {
      path: worktreePath,
      branch: branchName,
      newBranch: false,
    });

    const existingResult = await execGit(existingCmd, repoPath);

    if (!existingResult.success) {
      console.error(`Failed to create worktree: ${existingResult.error}`);
      return null;
    }
  }

  // Get the HEAD commit
  const headResult = await execGit(
    ["git", "rev-parse", "HEAD"],
    worktreePath
  );

  return {
    path: worktreePath,
    branch: branchName,
    ticketId,
    head: headResult.success ? headResult.output : "",
  };
}

/**
 * List all Jiratown-managed worktrees
 */
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const cmd = buildGitCommand("worktree", "list", { porcelain: true });
  const result = await execGit(cmd, repoPath);

  if (!result.success) {
    return [];
  }

  return parseWorktreeList(result.output, "-worktrees/");
}

/**
 * Check if a worktree exists for a ticket
 */
export async function worktreeExists(
  repoPath: string,
  ticketId: string
): Promise<boolean> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.some((wt) => wt.ticketId === ticketId);
}

/**
 * Get a worktree by ticket ID
 */
export async function getWorktree(
  repoPath: string,
  ticketId: string
): Promise<Worktree | null> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.find((wt) => wt.ticketId === ticketId) || null;
}

/**
 * Remove a worktree and optionally its branch
 */
export async function removeWorktree(
  repoPath: string,
  ticketId: string,
  deleteBranch: boolean = false
): Promise<boolean> {
  const worktree = await getWorktree(repoPath, ticketId);
  if (!worktree) {
    return false;
  }

  // Remove worktree
  const removeCmd = buildGitCommand("worktree", "remove", {
    path: worktree.path,
    force: true,
  });

  const removeResult = await execGit(removeCmd, repoPath);

  if (!removeResult.success) {
    console.error(`Failed to remove worktree: ${removeResult.error}`);
    return false;
  }

  // Optionally delete the branch
  if (deleteBranch && worktree.branch) {
    const branchCmd = buildGitCommand("branch", "-D", {
      branch: worktree.branch,
    });
    await execGit(branchCmd, repoPath);
  }

  return true;
}
