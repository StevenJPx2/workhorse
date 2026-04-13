import { type Worktree } from "./types.ts";
import {
  createWorktreePath,
  createBranchName,
  buildGitCommand,
  parseWorktreeList,
} from "./worktree-utils.ts";

async function execGit(
  args: string[],
  cwd?: string,
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

const worktreeTrace = (tid: string, step: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const traceLine = `[${timestamp}] worktree[${tid}] ${step}${data ? `: ${JSON.stringify(data)}` : ""}\n`;
  try {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const tracePath = path.join(os.tmpdir(), "jiratown-trace.log");
    fs.appendFileSync(tracePath, traceLine);
  } catch {
    // Silent fail for tracing
  }
  console.log(traceLine.trim());
};

export async function createWorktree(
  repoPath: string,
  ticketId: string,
  issueType?: string,
  baseBranch: string = "main",
): Promise<Worktree | null> {
  worktreeTrace(ticketId, "CREATE_ENTER", { repoPath: !!repoPath, issueType, baseBranch });

  const worktreePath = createWorktreePath(repoPath, ticketId);
  const branchName = createBranchName(ticketId, issueType);

  worktreeTrace(ticketId, "PATHS", { worktreePath, branchName });

  worktreeTrace(ticketId, "CHECKING_EXISTING");
  const existingWorktree = await getWorktree(repoPath, ticketId);
  if (existingWorktree) {
    worktreeTrace(ticketId, "REUSING_EXISTING", {
      path: existingWorktree.path,
      branch: existingWorktree.branch,
    });
    return existingWorktree;
  }

  worktreeTrace(ticketId, "FETCHING");
  const fetchResult = await execGit(["git", "fetch", "origin"], repoPath);
  worktreeTrace(ticketId, "FETCH_RESULT", {
    success: fetchResult.success,
    error: fetchResult.error,
  });

  const cmd = buildGitCommand("worktree", "add", {
    path: worktreePath,
    branch: branchName,
    newBranch: true,
  });
  cmd.push(`origin/${baseBranch}`);

  worktreeTrace(ticketId, "CREATING_WITH_BRANCH", { cmd: cmd.join(" ") });
  const result = await execGit(cmd, repoPath);
  worktreeTrace(ticketId, "CREATE_RESULT", {
    success: result.success,
    error: result.error,
    output: result.output,
  });

  if (!result.success) {
    worktreeTrace(ticketId, "TRYING_EXISTING_BRANCH");
    const existingCmd = buildGitCommand("worktree", "add", {
      path: worktreePath,
      branch: branchName,
      newBranch: false,
    });

    const existingResult = await execGit(existingCmd, repoPath);
    worktreeTrace(ticketId, "EXISTING_BRANCH_RESULT", {
      success: existingResult.success,
      error: existingResult.error,
    });

    if (!existingResult.success) {
      console.error(`Failed to create worktree: ${existingResult.error}`);
      worktreeTrace(ticketId, "FAILED", { error: existingResult.error });
      return null;
    }
  }

  worktreeTrace(ticketId, "GETTING_HEAD");
  const headResult = await execGit(["git", "rev-parse", "HEAD"], worktreePath);
  worktreeTrace(ticketId, "HEAD_RESULT", {
    success: headResult.success,
    output: headResult.output,
  });

  worktreeTrace(ticketId, "SUCCESS", { path: worktreePath, branch: branchName });
  return {
    path: worktreePath,
    branch: branchName,
    ticketId,
    head: headResult.success ? headResult.output : "",
  };
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const cmd = buildGitCommand("worktree", "list", { porcelain: true });
  const result = await execGit(cmd, repoPath);

  if (!result.success) {
    return [];
  }

  return parseWorktreeList(result.output, "-worktrees/");
}

export async function worktreeExists(repoPath: string, ticketId: string): Promise<boolean> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.some((wt) => wt.ticketId === ticketId);
}

export async function getWorktree(repoPath: string, ticketId: string): Promise<Worktree | null> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.find((wt) => wt.ticketId === ticketId) || null;
}

export async function removeWorktree(
  repoPath: string,
  ticketId: string,
  deleteBranch: boolean = false,
): Promise<boolean> {
  const worktree = await getWorktree(repoPath, ticketId);
  if (!worktree) {
    return false;
  }

  const removeCmd = buildGitCommand("worktree", "remove", {
    path: worktree.path,
    force: true,
  });
  const removeResult = await execGit(removeCmd, repoPath);

  if (!removeResult.success) {
    console.error(`Failed to remove worktree: ${removeResult.error}`);
    return false;
  }

  if (deleteBranch && worktree.branch) {
    const branchCmd = buildGitCommand("branch", "-D", {
      branch: worktree.branch,
    });
    await execGit(branchCmd, repoPath);
  }

  return true;
}
