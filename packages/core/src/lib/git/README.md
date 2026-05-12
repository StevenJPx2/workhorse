# Git Module

Git worktree operations for managing isolated working directories per issue.

## Overview

The git module provides operations for creating and removing git worktrees — one per issue. Each worktree gets its own branch and working directory, enabling agents to work on multiple issues simultaneously without conflicts.

## Architecture

```
Main Repo (/path/to/repo)
└── worktrees root (/path/to/repo-worktrees/)
    ├── PROJ-123/         ← Worktree for issue PROJ-123
    │   └── .jiratown/
    │       └── context.md
    ├── PROJ-456/         ← Worktree for issue PROJ-456
    │   └── .jiratown/
    │       └── context.md
    └── LOCAL-abc/        ← Worktree for local issue
```

## Usage

### Create a Worktree

```typescript
import { createWorktree } from "#lib/git";

const worktree = await createWorktree(
  "/path/to/repo",       // Main repo path
  "PROJ-123",            // Issue ID
  "task",                // Issue type (used for branch prefix)
  "main",                // Base branch (default: "main")
);

if (worktree) {
  console.log(worktree.path);    // "/path/to/repo-worktrees/PROJ-123"
  console.log(worktree.branch);  // "task/PROJ-123"
  console.log(worktree.head);    // "abc123def..."
  console.log(worktree.issueId); // "PROJ-123"
}
```

### Remove a Worktree

```typescript
import { removeWorktree } from "#lib/git";

const success = await removeWorktree(
  "/path/to/repo",       // Main repo path
  "PROJ-123",            // Issue ID
  true,                  // Delete branch too (default: false)
);
```

## Branch Naming

Branch names are derived from issue type and ID:

| Issue Type | Branch Name |
|------------|-------------|
| `"task"` | `task/PROJ-123` |
| `"bug"` | `bug/PROJ-123` |
| `"story"` | `story/PROJ-123` |
| `"epic"` | `epic/PROJ-123` |
| _(no type)_ | `PROJ-123` |

## Worktree Creation Flow

```
1. Check if worktree already exists → return existing
2. Check if directory exists on disk (orphaned) → fail with instructions
3. Fetch latest from origin
4. Create worktree with new branch from base
5. If branch already exists, create worktree from existing branch
6. Return WorktreeInfo
```

### Edge Cases

- **Existing worktree** — If the worktree is already registered and the path exists on disk, returns the existing one immediately.
- **Stale worktree** — If the worktree is registered in git but the path doesn't exist on disk, prunes the stale reference and creates fresh.
- **Orphaned directory** — If the directory exists on disk but isn't registered with git, fails with instructions to manually remove or repair. This prevents data loss from uncommitted work.

## Types

### WorktreeInfo

```typescript
interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name for this worktree */
  branch: string;
  /** Issue ID this worktree is for */
  issueId: string;
  /** HEAD commit SHA */
  head: string;
}
```

## Files

| File | Purpose |
|------|---------|
| `operations.ts` | `createWorktree()` and `removeWorktree()` functions |
| `utils.ts` | Helper functions (execGit, parseWorktreeList, buildBranchName, etc.) |
| `types.ts` | WorktreeInfo type definition |
| `index.ts` | Barrel exports |
