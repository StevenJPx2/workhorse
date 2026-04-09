import { join, dirname, basename } from "node:path";
import { type Worktree, BRANCH_PREFIXES } from "./types.ts";

export function createWorktreePath(repoPath: string, ticketId: string): string {
  const cleanRepoPath = repoPath.replace(/\/$/, "");
  const sanitizedTicketId = ticketId.replace(/[/:.]/g, "-");
  const repoDir = dirname(cleanRepoPath);
  const repoName = basename(cleanRepoPath);
  return join(repoDir, `${repoName}-worktrees`, sanitizedTicketId);
}

export function createBranchName(ticketId: string, issueType?: string): string {
  const prefix = issueType ? BRANCH_PREFIXES[issueType] || "feat" : "feat";
  return `${prefix}/${ticketId}`;
}

function extractTicketIdFromPath(path: string, worktreeMarker: string): string {
  const idx = path.indexOf(worktreeMarker);
  if (idx === -1) return "";
  return path.slice(idx + worktreeMarker.length);
}

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
        branch = line.slice(7).replace("refs/heads/", "");
      }
    }

    if (path && path.includes(worktreeMarker)) {
      const ticketId = extractTicketIdFromPath(path, worktreeMarker);
      worktrees.push({ path, branch, ticketId, head });
    }
  }

  return worktrees;
}

export function buildGitCommand(
  command: string,
  subcommand: string,
  options: import("./types.ts").GitCommandOptions
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
      break;
  }

  return args;
}