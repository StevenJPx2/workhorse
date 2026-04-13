export interface Worktree {
  path: string;
  branch: string;
  ticketId: string;
  head: string;
}

interface GitCommandOptions {
  path?: string;
  branch?: string;
  newBranch?: boolean;
  force?: boolean;
  porcelain?: boolean;
}

const BRANCH_PREFIXES: Record<string, string> = {
  Story: "feat",
  Bug: "fix",
  Task: "chore",
  "Sub-task": "chore",
};

export { GitCommandOptions, BRANCH_PREFIXES };
