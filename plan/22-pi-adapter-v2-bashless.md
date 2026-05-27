# Plan 22: Pi Adapter — Bash-less Rewrite

Rewrite the Pi adapter to remove bash access entirely and provide purpose-built tools for all operations agents typically perform via shell commands.

## Foundation: AFT Integration

This plan builds on top of [AFT (Agent File Toolkit)](https://github.com/cortexkit/aft) — a tree-sitter powered toolkit for AI coding agents. AFT provides the file manipulation layer with safety/recovery features, while we build the dev workflow tools (git, project, script) that replace bash.

### What We Use From AFT

Install via: `pi install npm:@cortexkit/aft-pi`

| Tool | What It Provides |
|------|------------------|
| `aft_safety` | Undo, history, checkpoint, restore — file recovery |
| `read` (hoisted) | File reading with line numbers, directory listing |
| `write` (hoisted) | File writing with backups, auto-format, inline LSP diagnostics |
| `edit` (hoisted) | Find/replace, symbol replace, batch edits — with backups |
| `aft_outline` | Structural outline of files (symbols, kinds, ranges) |
| `aft_zoom` | Inspect symbols with call-graph annotations |
| `aft_import` | Language-aware import add/remove/organize |
| `aft_conflicts` | Git merge conflict viewer with line-numbered regions |
| `grep` (hoisted) | Trigram-indexed regex search |
| `glob` (hoisted) | Indexed file discovery |

### What We Don't Use From AFT

- **Bash hoisting/rewriter** — we're going bash-less entirely
- **`aft_search` semantic search** — we have our own L2 code intelligence
- **Background bash tasks** — no bash = no background bash

### What We Build Ourselves

| Tool | Purpose |
|------|---------|
| `git` | Consolidated git operations (11 actions) |
| `project` | Package manager detection + install/add/remove |
| `script` | File-based script execution in `.workhorse/scripts/` |

## Motivation

### Why Remove Bash?

1. **Security surface** — Bash is the most dangerous tool; even with path restrictions, clever escapes exist (env vars, subshells, symlinks)
2. **Predictability** — Purpose-built tools have well-defined behavior; bash commands vary across systems
3. **Observability** — Tool calls are structured and logged; bash output is opaque
4. **Token efficiency** — Agents waste tokens on shell boilerplate (`cd`, `&&`, error handling)
5. **Reproducibility** — Tool executions can be replayed; bash sessions cannot
6. **Control** — We can rate-limit, timeout, and retry individual operations

### What Agents Use Bash For

Analysis of typical Pi agent bash usage:

| Category | Commands | Replacement |
|----------|----------|-------------|
| **Git** | `git status`, `git diff`, `git add`, `git commit`, `git push`, `git pull`, `git checkout`, `git branch`, `git log`, `git stash`, `git reset` | `git` tool |
| **Package managers** | `bun install`, `npm install`, `yarn`, `pnpm`, `pip install`, `cargo build` | `project` tool |
| **Test runners** | `bun test`, `npm test`, `vitest`, `pytest`, `cargo test` | `script` tool |
| **Linters/formatters** | `bun run lint`, `prettier`, `eslint`, `oxlint`, `ruff`, `cargo fmt` | `script` tool |
| **Type checkers** | `tsc`, `bun run typecheck`, `mypy`, `pyright` | `script` tool |
| **Build commands** | `bun run build`, `npm run build`, `cargo build`, `make` | `script` tool |
| **File operations** | `mkdir`, `rm`, `mv`, `cp`, `touch` | AFT `write`/`edit` |
| **Search** | `grep`, `find`, `rg` | AFT `grep`/`glob` |
| **Misc** | `curl`, `jq`, `env`, `which` | Rare — not supported |

## Design

### Core Principle

Replace bash with **structured tools** that do exactly what agents need:

```
Bash (dangerous, unstructured)     →    Tools (safe, structured)
────────────────────────────────        ─────────────────────────
git status                              git { action: "status" }
git diff HEAD~1                         git { action: "diff", ref: "HEAD~1" }
git commit -m "msg"                     git { action: "commit", message: "msg" }
bun test src/foo.test.ts                script { action: "run", name: "test", args: ["src/foo.test.ts"] }
bun run lint                            script { action: "run", name: "lint" }
bun install zod                         project { action: "add", packages: ["zod"] }
```

### Tool Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Pi Adapter v2                             │
├─────────────────────────────────────────────────────────────────┤
│  AFT Layer (npm:@cortexkit/aft-pi)                              │
│  ├── aft_safety     — undo, checkpoint, restore                 │
│  ├── read/write/edit — hoisted with backups, format, LSP        │
│  ├── grep/glob      — trigram-indexed search                    │
│  ├── aft_outline    — structural file navigation                │
│  ├── aft_zoom       — symbol inspection with call graphs        │
│  ├── aft_import     — language-aware import management          │
│  └── aft_conflicts  — git merge conflict viewer                 │
├─────────────────────────────────────────────────────────────────┤
│  Workhorse Layer (our tools)                                    │
│  ├── git            — consolidated git operations (11 actions)  │
│  ├── project        — package manager install/add/remove        │
│  └── script         — file-based script execution               │
├─────────────────────────────────────────────────────────────────┤
│  ❌ NO BASH                                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Tool Categories

#### 1. Git Tool (High Priority) — Consolidated

Single `git` tool with type-safe `action` parameter. Each action is implemented in its own isolated module.

```typescript
// Single consolidated git tool
{
  name: "git",
  description: "Git operations — status, diff, commit, branch, push, pull, etc.",
  schema: {
    type: "object",
    properties: {
      action: { 
        type: "string", 
        enum: ["status", "diff", "add", "commit", "checkout", "branch", "log", "push", "pull", "stash", "reset"],
        description: "Git action to perform"
      },
      // For "diff"
      ref: { type: "string", description: "Commit/branch reference (for diff, checkout, reset)" },
      staged: { type: "boolean", description: "Show staged changes (for diff)" },
      stat: { type: "boolean", description: "Show diffstat only (for diff)" },
      // For "add"
      paths: { type: "array", items: { type: "string" }, description: "Paths to operate on (for add)" },
      all: { type: "boolean", description: "All files (for add, branch)" },
      // For "commit"
      message: { type: "string", description: "Commit message (for commit, stash push)" },
      // For "checkout"
      create: { type: "boolean", description: "Create new branch (for checkout)" },
      // For "branch"
      name: { type: "string", description: "Branch name (for branch create/delete)" },
      delete: { type: "boolean", description: "Delete branch (for branch)" },
      list: { type: "boolean", description: "List branches (for branch)" },
      // For "log"
      limit: { type: "number", description: "Number of commits (for log, default: 10)" },
      oneline: { type: "boolean", description: "One line per commit (for log)" },
      since: { type: "string", description: "Show commits since date (for log)" },
      // For "push" / "pull"
      remote: { type: "string", description: "Remote name (for push/pull, default: origin)" },
      branch: { type: "string", description: "Branch name (for push/pull)" },
      setUpstream: { type: "boolean", description: "Set upstream tracking (for push)" },
      force: { type: "boolean", description: "Force push with lease (for push)" },
      rebase: { type: "boolean", description: "Rebase instead of merge (for pull)" },
      // For "stash"
      stashAction: { type: "string", enum: ["push", "pop", "list", "drop", "apply"], description: "Stash sub-action" },
      index: { type: "number", description: "Stash index (for stash pop/drop/apply)" },
      // For "reset"
      mode: { type: "string", enum: ["soft", "mixed", "hard"], description: "Reset mode (for reset)" },
      // Common
      path: { type: "string", description: "File path (for diff, checkout, log, reset)" }
    },
    required: ["action"]
  }
}
```

**Usage Examples:**

```
git { action: "status" }
git { action: "diff" }
git { action: "diff", ref: "HEAD~1" }
git { action: "diff", staged: true }
git { action: "diff", path: "src/app.ts" }
git { action: "add", paths: ["src/foo.ts", "src/bar.ts"] }
git { action: "add", all: true }
git { action: "commit", message: "feat: add new feature" }
git { action: "checkout", ref: "main" }
git { action: "checkout", ref: "feature/foo", create: true }
git { action: "checkout", path: "src/app.ts" }              // restore file
git { action: "branch", list: true }
git { action: "branch", list: true, all: true }             // include remotes
git { action: "branch", name: "feature/bar", create: true }
git { action: "branch", name: "old-branch", delete: true }
git { action: "log" }
git { action: "log", limit: 5, oneline: true }
git { action: "log", path: "src/", since: "2024-01-01" }
git { action: "push" }
git { action: "push", setUpstream: true }
git { action: "push", force: true }                         // uses --force-with-lease
git { action: "pull" }
git { action: "pull", rebase: true }
git { action: "stash", stashAction: "push", message: "WIP" }
git { action: "stash", stashAction: "pop" }
git { action: "stash", stashAction: "list" }
git { action: "stash", stashAction: "drop", index: 0 }
git { action: "reset", path: "src/foo.ts" }                 // unstage file
git { action: "reset", ref: "HEAD~1", mode: "soft" }
git { action: "reset", ref: "HEAD", mode: "hard" }
```

**Modular Implementation:**

Each action is implemented in its own isolated module with a single executor function:

```typescript
// tools/git/index.ts — Main dispatcher
import { executeStatus } from "./actions/status";
import { executeDiff } from "./actions/diff";
import { executeAdd } from "./actions/add";
import { executeCommit } from "./actions/commit";
// ... etc

export async function executeGit(cwd: string, params: GitParams): Promise<GitResult> {
  switch (params.action) {
    case "status": return executeStatus(cwd, params);
    case "diff": return executeDiff(cwd, params);
    case "add": return executeAdd(cwd, params);
    case "commit": return executeCommit(cwd, params);
    case "checkout": return executeCheckout(cwd, params);
    case "branch": return executeBranch(cwd, params);
    case "log": return executeLog(cwd, params);
    case "push": return executePush(cwd, params);
    case "pull": return executePull(cwd, params);
    case "stash": return executeStash(cwd, params);
    case "reset": return executeReset(cwd, params);
    default:
      throw new Error(`Unknown git action: ${params.action}`);
  }
}

// tools/git/actions/status.ts — Isolated status implementation
export interface StatusParams {
  action: "status";
}

export interface StatusResult {
  branch: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}

export async function executeStatus(cwd: string, _params: StatusParams): Promise<StatusResult> {
  const result = await $`git status --porcelain=v2 --branch`.cwd(cwd).quiet();
  if (result.exitCode !== 0) {
    throw new Error(`git status failed: ${result.stderr}`);
  }
  return parseStatusOutput(result.stdout.toString());
}

// tools/git/actions/diff.ts — Isolated diff implementation
export interface DiffParams {
  action: "diff";
  ref?: string;
  path?: string;
  staged?: boolean;
  stat?: boolean;
}

export async function executeDiff(cwd: string, params: DiffParams): Promise<string> {
  const args = ["diff"];
  if (params.staged) args.push("--cached");
  if (params.stat) args.push("--stat");
  if (params.ref) args.push(params.ref);
  if (params.path) args.push("--", params.path);
  
  const result = await $`git ${args}`.cwd(cwd).quiet();
  return result.stdout.toString();
}

// tools/git/actions/commit.ts — Isolated commit implementation
export interface CommitParams {
  action: "commit";
  message: string;
  all?: boolean;
}

export async function executeCommit(cwd: string, params: CommitParams): Promise<CommitResult> {
  if (!params.message) {
    throw new Error("Commit message is required");
  }
  
  const args = ["commit", "-m", params.message];
  if (params.all) args.push("-a");
  
  const result = await $`git ${args}`.cwd(cwd).quiet();
  if (result.exitCode !== 0) {
    throw new Error(`git commit failed: ${result.stderr}`);
  }
  return parseCommitOutput(result.stdout.toString());
}
```

#### 2. Project Tool (High Priority) — Package Management Only

Handles dependency management. Uses [`package-manager-detector`](https://github.com/antfu-collective/package-manager-detector) for detection.

```typescript
{
  name: "project",
  description: "Manage project dependencies — auto-detects package manager (npm/bun/cargo/pip/go)",
  schema: {
    type: "object",
    properties: {
      action: { 
        type: "string", 
        enum: ["install", "add", "remove"],
        description: "Action to perform"
      },
      packages: { type: "array", items: { type: "string" }, description: "Package names (for add/remove)" },
      dev: { type: "boolean", description: "Dev dependency (for add)" },
      frozen: { type: "boolean", description: "Use frozen lockfile (for install)" }
    },
    required: ["action"]
  }
}
```

**Usage Examples:**

```
project { action: "install" }                              → bun install / cargo fetch / pip install
project { action: "install", frozen: true }                → bun install --frozen-lockfile
project { action: "add", packages: ["zod"], dev: true }    → bun add -d zod / cargo add zod
project { action: "remove", packages: ["lodash"] }         → bun remove lodash
```

#### 3. Script Tool (High Priority) — File-Based Script Execution

**Core principle:** Agent cannot run arbitrary commands. It must create a script file first, then run it by name. This provides:

- **Auditability** — all scripts are files, can be reviewed/version-controlled
- **No ephemeral commands** — prevents `rm -rf /` or other dangerous one-liners  
- **Reproducibility** — scripts can be re-run, shared, committed to repo
- **Isolation** — only files in `.workhorse/scripts/` can be executed

```typescript
{
  name: "script",
  description: "Create and run script files. Scripts live in .workhorse/scripts/ and are the ONLY way to run shell commands.",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "list", "read", "run", "delete"],
        description: "Action to perform"
      },
      // For "create" / "read" / "run" / "delete"
      name: { type: "string", description: "Script name (without extension)" },
      // For "create"
      content: { type: "string", description: "Script content (for create)" },
      // For "run"
      args: { type: "array", items: { type: "string" }, description: "Arguments to pass to script" }
    },
    required: ["action"]
  }
}
```

**Usage Examples:**

```
# Create a lint script
script { 
  action: "create", 
  name: "lint", 
  content: "#!/bin/bash\nbun run lint --fix \"$@\"" 
}

# Create a test script
script { 
  action: "create", 
  name: "test", 
  content: "#!/bin/bash\nbun test \"$@\"" 
}

# List available scripts
script { action: "list" }
→ { scripts: ["lint", "test", "build"] }

# Read a script's content
script { action: "read", name: "lint" }
→ { name: "lint", content: "#!/bin/bash\nbun run lint --fix \"$@\"" }

# Run a script
script { action: "run", name: "lint" }
script { action: "run", name: "test", args: ["--coverage"] }
script { action: "run", name: "test", args: ["src/auth.test.ts"] }

# Delete a script
script { action: "delete", name: "lint" }
```

**Script location:** `.workhorse/scripts/`
```
.workhorse/
└── scripts/
    ├── lint.sh
    ├── test.sh
    ├── build.sh
    └── typecheck.sh
```

**Script frontmatter — status gating:**

Scripts can declare which workflow statuses they're available in using frontmatter comments, similar to how tools have `status` fields (see Plan 23). This enables scripts to be status-gated just like native tools.

```bash
#!/bin/bash
# ---
# name: test
# description: Run test suite with optional coverage
# status: [implementing, in_review]
# args:
#   - name: pattern
#     description: Test file pattern or specific test file
#     required: false
#   - name: --coverage
#     description: Generate coverage report
#     required: false
# ---

bun test "$@"
```

```bash
#!/bin/bash
# ---
# name: lint
# description: Run linter and auto-fix issues
# status: implementing
# args:
#   - name: path
#     description: Specific file or directory to lint
#     required: false
# ---

bun run lint --fix "$@"
```

```bash
#!/bin/bash
# ---
# name: check-types
# description: Run type checker (read-only verification)
# status: [planning, implementing, in_review]
# args: []
# ---

bun run typecheck "$@"
```

**Frontmatter schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Display name (defaults to filename) |
| `description` | string | No | What the script does (shown in `script { action: "list" }`) |
| `status` | string \| string[] | No | Workflow statuses where script is available |
| `args` | array | No | Expected arguments with name, description, required |

**Args schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Argument name (e.g., `pattern`, `--coverage`) |
| `description` | string | No | What the argument does |
| `required` | boolean | No | Whether argument is required (default: false) |

**Behavior:**
- Scripts without `status` field are available in ALL statuses (backward compatible)
- Scripts with `status: implementing` are only runnable during implementation
- Scripts with `status: [implementing, in_review]` are available in both
- `script { action: "list" }` shows which scripts are available for current status
- `script { action: "run" }` returns error if script is status-gated and current status doesn't match

**Example list output:**

```
script { action: "list" }

# During "planning" status:
→ { 
    scripts: [
      { 
        name: "check-types", 
        description: "Run type checker", 
        status: ["planning", "implementing", "in_review"],
        args: []
      }
    ],
    unavailable: [
      { name: "test", reason: "Only available in: implementing, in_review" },
      { name: "lint", reason: "Only available in: implementing" }
    ]
  }

# During "implementing" status:
→ { 
    scripts: [
      { 
        name: "test", 
        description: "Run test suite", 
        status: ["implementing", "in_review"],
        args: [
          { name: "pattern", description: "Test file pattern or specific test file", required: false },
          { name: "--coverage", description: "Generate coverage report", required: false }
        ]
      },
      { 
        name: "lint", 
        description: "Run linter", 
        status: ["implementing"],
        args: [
          { name: "path", description: "Specific file or directory to lint", required: false }
        ]
      },
      { 
        name: "check-types", 
        description: "Run type checker", 
        status: ["planning", "implementing", "in_review"],
        args: []
      }
    ],
    unavailable: []
  }
```

**Example run with args:**

```
# Run all tests
script { action: "run", name: "test" }

# Run specific test file
script { action: "run", name: "test", args: ["src/auth.test.ts"] }

# Run tests with coverage
script { action: "run", name: "test", args: ["--coverage"] }

# Run specific test with coverage
script { action: "run", name: "test", args: ["src/auth.test.ts", "--coverage"] }

# Lint specific directory
script { action: "run", name: "lint", args: ["src/components/"] }
```

**Security constraints:**
- Scripts MUST be in `.workhorse/scripts/` directory
- Script names are sanitized (alphanumeric + hyphens + underscores only)
- Cannot reference scripts outside the directory (no `../` or absolute paths)
- Scripts are created with execute permission automatically
- Frontmatter is parsed but not executed (YAML-like format, not shell expansion)

**Pre-seeded scripts (optional):** On first run or via `script { action: "init" }`, detect project type and create common scripts:

```typescript
// For Node/Bun projects, auto-create from package.json scripts:
// .workhorse/scripts/test.sh   → "#!/bin/bash\nbun run test \"$@\""
// .workhorse/scripts/lint.sh   → "#!/bin/bash\nbun run lint \"$@\""
// .workhorse/scripts/build.sh  → "#!/bin/bash\nbun run build \"$@\""

// For Rust projects:
// .workhorse/scripts/test.sh   → "#!/bin/bash\ncargo test \"$@\""
// .workhorse/scripts/build.sh  → "#!/bin/bash\ncargo build \"$@\""
// .workhorse/scripts/check.sh  → "#!/bin/bash\ncargo check && cargo clippy"
```

**Modular Implementation:**

```typescript
// tools/script/index.ts — Main dispatcher
import { executeCreate } from "./actions/create";
import { executeList } from "./actions/list";
import { executeRead } from "./actions/read";
import { executeRun } from "./actions/run";
import { executeDelete } from "./actions/delete";
import type { ScriptParams, ScriptResult } from "./types";

const SCRIPTS_DIR = ".workhorse/scripts";

export async function executeScript(cwd: string, params: ScriptParams): Promise<ScriptResult> {
  const scriptsPath = join(cwd, SCRIPTS_DIR);
  
  switch (params.action) {
    case "create": return executeCreate(scriptsPath, params);
    case "list": return executeList(scriptsPath);
    case "read": return executeRead(scriptsPath, params);
    case "run": return executeRun(scriptsPath, cwd, params);
    case "delete": return executeDelete(scriptsPath, params);
    default:
      throw new Error(`Unknown script action: ${params.action}`);
  }
}

// tools/script/actions/create.ts
import { writeFile, mkdir, chmod } from "fs/promises";
import { join } from "path";

export async function executeCreate(
  scriptsPath: string, 
  params: { name: string; content: string }
): Promise<{ created: string }> {
  validateScriptName(params.name);
  
  // Ensure directory exists
  await mkdir(scriptsPath, { recursive: true });
  
  const scriptPath = join(scriptsPath, `${params.name}.sh`);
  
  // Ensure content starts with shebang
  let content = params.content;
  if (!content.startsWith("#!")) {
    content = "#!/bin/bash\n" + content;
  }
  
  await writeFile(scriptPath, content, "utf-8");
  await chmod(scriptPath, 0o755); // Make executable
  
  return { created: params.name };
}

function validateScriptName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid script name: "${name}". Use only letters, numbers, hyphens, underscores.`);
  }
  if (name.includes("..") || name.startsWith("/")) {
    throw new Error(`Invalid script name: "${name}". Path traversal not allowed.`);
  }
}

// tools/script/actions/run.ts
import { access, constants, readFile } from "fs/promises";
import { join } from "path";
import { $ } from "bun";
import { parseFrontmatter } from "../frontmatter";

export async function executeRun(
  scriptsPath: string,
  cwd: string,
  currentStatus: IssueStatus,
  params: { name: string; args?: string[] }
): Promise<{ success: boolean; output: string; error?: string }> {
  validateScriptName(params.name);
  
  const scriptPath = join(scriptsPath, `${params.name}.sh`);
  
  // Verify script exists
  try {
    await access(scriptPath, constants.X_OK);
  } catch {
    throw new Error(`Script not found or not executable: ${params.name}`);
  }
  
  // Parse frontmatter and check status gating
  const content = await readFile(scriptPath, "utf-8");
  const meta = parseFrontmatter(content);
  
  if (meta.status && !meta.status.includes(currentStatus)) {
    return {
      success: false,
      output: "",
      error: `Script "${params.name}" is not available during "${currentStatus}" status. ` +
             `Allowed: ${meta.status.join(", ")}. ` +
             `Use workhorse_update_status to transition.`
    };
  }
  
  // Run the script from project root
  const args = params.args ?? [];
  const result = await $`${scriptPath} ${args}`.cwd(cwd).quiet();
  
  return {
    success: result.exitCode === 0,
    output: result.stdout.toString(),
    error: result.exitCode !== 0 ? result.stderr.toString() : undefined,
  };
}

// tools/script/frontmatter.ts
export interface ScriptArg {
  name: string;
  description?: string;
  required?: boolean;
}

export interface ScriptMeta {
  name?: string;
  description?: string;
  status?: IssueStatus[];
  args?: ScriptArg[];
}

/**
 * Parse YAML-like frontmatter from script comments.
 * 
 * Format:
 * ```
 * #!/bin/bash
 * # ---
 * # name: test
 * # description: Run test suite
 * # status: [implementing, in_review]
 * # ---
 * ```
 */
export function parseFrontmatter(content: string): ScriptMeta {
  const lines = content.split("\n");
  const meta: ScriptMeta = {};
  
  // Find frontmatter block (# --- ... # ---)
  let inFrontmatter = false;
  let frontmatterLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === "# ---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        break; // End of frontmatter
      }
    }
    
    if (inFrontmatter && trimmed.startsWith("# ")) {
      frontmatterLines.push(trimmed.slice(2)); // Remove "# " prefix
    }
  }
  
  // Parse key-value pairs (simple YAML-like format)
  let currentKey: string | null = null;
  let currentArgs: ScriptArg[] = [];
  let currentArg: Partial<ScriptArg> | null = null;
  
  for (const line of frontmatterLines) {
    // Top-level key: value
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch && !line.startsWith("  ")) {
      // Save previous arg if any
      if (currentArg?.name) {
        currentArgs.push(currentArg as ScriptArg);
        currentArg = null;
      }
      
      const [, key, value] = topMatch;
      currentKey = key;
      
      switch (key) {
        case "name":
          meta.name = value.trim();
          break;
        case "description":
          meta.description = value.trim();
          break;
        case "status":
          // Parse array syntax: [a, b, c] or single value
          if (value.startsWith("[") && value.endsWith("]")) {
            meta.status = value
              .slice(1, -1)
              .split(",")
              .map(s => s.trim() as IssueStatus);
          } else if (value.trim()) {
            meta.status = [value.trim() as IssueStatus];
          }
          break;
        case "args":
          // Empty array or start of list
          if (value.trim() === "[]") {
            meta.args = [];
          }
          // Otherwise, args will be parsed from indented lines
          break;
      }
      continue;
    }
    
    // Nested under args: parse "  - name: value" or "    key: value"
    if (currentKey === "args") {
      const listItemMatch = line.match(/^\s+-\s+name:\s*(.+)$/);
      if (listItemMatch) {
        // Save previous arg
        if (currentArg?.name) {
          currentArgs.push(currentArg as ScriptArg);
        }
        currentArg = { name: listItemMatch[1].trim() };
        continue;
      }
      
      const nestedMatch = line.match(/^\s+(\w+):\s*(.+)$/);
      if (nestedMatch && currentArg) {
        const [, nestedKey, nestedValue] = nestedMatch;
        if (nestedKey === "description") {
          currentArg.description = nestedValue.trim();
        } else if (nestedKey === "required") {
          currentArg.required = nestedValue.trim() === "true";
        }
      }
    }
  }
  
  // Save last arg
  if (currentArg?.name) {
    currentArgs.push(currentArg as ScriptArg);
  }
  
  if (currentArgs.length > 0) {
    meta.args = currentArgs;
  }
  
  return meta;
}

// tools/script/actions/list.ts
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { parseFrontmatter, type ScriptMeta, type ScriptArg } from "../frontmatter";

interface ScriptInfo {
  name: string;
  description?: string;
  status?: string[];
  args?: ScriptArg[];
}

export async function executeList(
  scriptsPath: string,
  currentStatus: IssueStatus
): Promise<{ scripts: ScriptInfo[]; unavailable: Array<{ name: string; reason: string }> }> {
  try {
    const files = await readdir(scriptsPath);
    const scripts: ScriptInfo[] = [];
    const unavailable: Array<{ name: string; reason: string }> = [];
    
    for (const file of files.filter(f => f.endsWith(".sh"))) {
      const name = file.replace(/\.sh$/, "");
      const content = await readFile(join(scriptsPath, file), "utf-8");
      const meta = parseFrontmatter(content);
      
      const info: ScriptInfo = {
        name: meta.name ?? name,
        description: meta.description,
        status: meta.status,
        args: meta.args,
      };
      
      // Check if script is available in current status
      if (!meta.status || meta.status.includes(currentStatus)) {
        scripts.push(info);
      } else {
        unavailable.push({
          name: info.name,
          reason: `Only available in: ${meta.status.join(", ")}`
        });
      }
    }
    
    return { scripts, unavailable };
  } catch {
    return { scripts: [], unavailable: [] }; // Directory doesn't exist yet
  }
}

// tools/script/actions/read.ts
import { readFile } from "fs/promises";
import { join } from "path";

export async function executeRead(
  scriptsPath: string,
  params: { name: string }
): Promise<{ name: string; content: string }> {
  validateScriptName(params.name);
  
  const scriptPath = join(scriptsPath, `${params.name}.sh`);
  const content = await readFile(scriptPath, "utf-8");
  
  return { name: params.name, content };
}

// tools/script/actions/delete.ts
import { unlink } from "fs/promises";
import { join } from "path";

export async function executeDelete(
  scriptsPath: string,
  params: { name: string }
): Promise<{ deleted: string }> {
  validateScriptName(params.name);
  
  const scriptPath = join(scriptsPath, `${params.name}.sh`);
  await unlink(scriptPath);
  
  return { deleted: params.name };
}
```

#### 3. File Tools (Provided by AFT)

These are provided by AFT with enhanced features:
- `read` — File reading with line numbers, directory listing, image/PDF detection
- `write` — File writing with backups, auto-format, inline LSP diagnostics
- `edit` — Find/replace, symbol replace, batch edits — with backups and validation
- `grep` — Trigram-indexed regex search (fast)
- `glob` — Indexed file discovery
- `aft_safety` — Undo, history, checkpoint, restore
- `aft_outline` — Structural file navigation
- `aft_zoom` — Symbol inspection with call graphs
- `aft_import` — Language-aware import management
- `aft_conflicts` — Git merge conflict viewer

### Package Manager Detection

Uses [`package-manager-detector`](https://github.com/antfu-collective/package-manager-detector) for reliable detection:



## File Structure

```
packages/plugins/pi-adapter/
├── src/
│   ├── index.ts                    # Plugin definition
│   ├── adapter.ts                  # PiAgentAdapter (no bash)
│   ├── registry.ts                 # Model registry
│   ├── tools/
│   │   ├── index.ts                # Tool registration (git + project + script)
│   │   ├── git/
│   │   │   ├── index.ts            # git tool definition + dispatcher
│   │   │   ├── types.ts            # GitParams, GitResult types
│   │   │   └── actions/
│   │   │       ├── status.ts       # executeStatus()
│   │   │       ├── diff.ts         # executeDiff()
│   │   │       ├── add.ts          # executeAdd()
│   │   │       ├── commit.ts       # executeCommit()
│   │   │       ├── checkout.ts     # executeCheckout()
│   │   │       ├── branch.ts       # executeBranch()
│   │   │       ├── log.ts          # executeLog()
│   │   │       ├── push.ts         # executePush()
│   │   │       ├── pull.ts         # executePull()
│   │   │       ├── stash.ts        # executeStash()
│   │   │       └── reset.ts        # executeReset()
│   │   ├── project/
│   │   │   ├── index.ts            # project tool definition + dispatcher
│   │   │   ├── types.ts            # ProjectParams, ProjectResult
│   │   │   ├── detect.ts           # Package manager detection
│   │   │   └── actions/
│   │   │       ├── install.ts      # executeInstall()
│   │   │       ├── add.ts          # executeAdd()
│   │   │       └── remove.ts       # executeRemove()
│   │   ├── script/
│   │   │   ├── index.ts            # script tool definition + dispatcher
│   │   │   ├── types.ts            # ScriptParams, ScriptResult, ScriptMeta
│   │   │   ├── frontmatter.ts      # parseFrontmatter() for status/description
│   │   │   └── actions/
│   │   │       ├── create.ts       # executeCreate()
│   │   │       ├── list.ts         # executeList() with status filtering
│   │   │       ├── read.ts         # executeRead() with parsed meta
│   │   │       ├── run.ts          # executeRun() with status gating
│   │   │       └── delete.ts       # executeDelete()
│   │   └── env/
│   │       ├── index.ts            # env_info + file_ops tool definitions
│   │       └── actions/
│   │           ├── info.ts         # executeInfo()
│   │           └── file-ops.ts     # executeFileOp()
│   ├── renderers/
│   │   └── tools.ts                # TUI renderers for new tools
│   └── __tests__/
│       ├── git/
│       │   ├── status.test.ts
│       │   ├── diff.test.ts
│       │   ├── commit.test.ts
│       │   └── ...
│       ├── project/
│       │   ├── detect.test.ts
│       │   ├── install.test.ts
│       │   └── ...
│       ├── script/
│       │   ├── create.test.ts
│       │   ├── run.test.ts
│       │   └── ...
│       └── integration.test.ts
├── package.json
└── README.md
```

## Implementation

### Adapter Changes

```typescript
// packages/plugins/pi-adapter/src/adapter.ts
export class PiAgentAdapter extends AgentAdapter {
  override readonly harness = "pi-coding-agent";
  static override readonly displayName = "Pi Coding Agent";
  static override readonly icon = "🥧";

  protected override async doStart(): Promise<void> {
    const { session } = await createAgentSession({
      cwd: this.worktreePath,
      resourceLoader: loader,
      customTools: [
        // File tools (path-restricted)
        createReadTool(this.worktreePath, { operations: restrictedRead }),
        createWriteTool(this.worktreePath, { operations: restrictedWrite }),
        createEditTool(this.worktreePath, { operations: restrictedEdit }),
        // NO bash tool — replaced by structured tools below
      ],
    });
    
    // Register git tools
    this.registerGitTools(session);
    
    // Register project tools  
    this.registerProjectTools(session);
    
    // Register env tools
    this.registerEnvTools(session);
  }
}
```

### Tool Execution Pattern

All tools execute commands internally but expose structured interfaces:

```typescript
// packages/plugins/pi-adapter/src/tools/git/status.ts
import { $ } from "bun";

export async function executeGitStatus(
  cwd: string,
  options: { short?: boolean }
): Promise<GitStatusResult> {
  const args = ["status", "--porcelain=v1"];
  
  const result = await $`git ${args}`.cwd(cwd).quiet();
  
  if (result.exitCode !== 0) {
    throw new Error(`git status failed: ${result.stderr}`);
  }
  
  // Parse porcelain output into structured result
  return parseGitStatus(result.stdout.toString());
}

interface GitStatusResult {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  branch: string;
  ahead: number;
  behind: number;
}

interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
  oldPath?: string; // For renames
}
```

### Path Restriction

All tools validate paths before execution:

```typescript
// Common pattern for all tools
function validatePath(path: string, worktreePath: string): string {
  const resolved = resolve(worktreePath, path);
  if (!resolved.startsWith(worktreePath)) {
    throw new Error(`Path "${path}" is outside the worktree`);
  }
  return resolved;
}
```

## What Gets Removed

The following files will be deleted from `packages/plugins/pi-adapter/src/`:

- `bash-restriction.ts` — No longer needed (no bash)
- `git-operation-tracker.ts` — No longer needed (git tools handle this internally)
- `__tests__/bash-restriction.test.ts` — No longer needed
- `__tests__/git-operation-tracker.test.ts` — No longer needed

## Tasks

### Phase 1: Git Tool (Consolidated)
- [ ] Create `src/tools/git/` directory structure with `actions/` subdirectory
- [ ] Define `git` tool schema in `index.ts` with action enum
- [ ] Define types in `types.ts` (GitParams, discriminated union per action)
- [ ] Implement `actions/status.ts` — executeStatus() with structured output
- [ ] Implement `actions/diff.ts` — executeDiff() with ref/staged/stat options
- [ ] Implement `actions/add.ts` — executeAdd() with paths/all options
- [ ] Implement `actions/commit.ts` — executeCommit() with message validation
- [ ] Implement `actions/checkout.ts` — executeCheckout() with create branch support
- [ ] Implement `actions/branch.ts` — executeBranch() with list/create/delete
- [ ] Implement `actions/log.ts` — executeLog() with limit/oneline/since
- [ ] Implement `actions/push.ts` — executePush() with --force-with-lease safety
- [ ] Implement `actions/pull.ts` — executePull() with rebase option
- [ ] Implement `actions/stash.ts` — executeStash() with push/pop/list/drop/apply
- [ ] Implement `actions/reset.ts` — executeReset() with soft/mixed/hard modes
- [ ] Unit tests for each action in `__tests__/git/`

### Phase 2: Project Tool (Package Management Only)
- [ ] Create `src/tools/project/` directory structure with `actions/` subdirectory
- [ ] Define `project` tool schema in `index.ts` with action enum (install, add, remove)
- [ ] Define types in `types.ts` (ProjectParams, ProjectResult)
- [ ] Implement `detect.ts` — detect package manager using `package-manager-detector`
- [ ] Implement `actions/install.ts` — executeInstall() with frozen lockfile support
- [ ] Implement `actions/add.ts` — executeAdd() with dev dependency support
- [ ] Implement `actions/remove.ts` — executeRemove()
- [ ] Unit tests for each action in `__tests__/project/`

### Phase 3: Script Tool (File-Based Execution)
- [ ] Create `src/tools/script/` directory structure with `actions/` subdirectory
- [ ] Define `script` tool schema in `index.ts` with action enum (create, list, read, run, delete)
- [ ] Define types in `types.ts` (ScriptParams, ScriptResult, ScriptMeta)
- [ ] Implement `frontmatter.ts` — parseFrontmatter() for status/description extraction
- [ ] Implement `actions/create.ts` — executeCreate() with shebang injection, chmod
- [ ] Implement `actions/list.ts` — executeList() with frontmatter parsing, status filtering
- [ ] Implement `actions/read.ts` — executeRead() returns script content + parsed meta
- [ ] Implement `actions/run.ts` — executeRun() with status gating enforcement
- [ ] Implement `actions/delete.ts` — executeDelete()
- [ ] Implement script name validation (alphanumeric, hyphens, underscores only)
- [ ] Unit tests for each action in `__tests__/script/`
- [ ] Unit tests for frontmatter parsing

### Phase 4: Environment Tools
- [ ] Create `src/tools/env/` directory structure with `actions/` subdirectory
- [ ] Implement `env_info` tool with executeInfo()
- [ ] Implement `file_ops` tool with executeFileOp() (mkdir, rm, mv, cp)
- [ ] Unit tests for env tools

### Phase 5: Adapter Integration
- [ ] Remove bash tool from adapter
- [ ] Register `git`, `project`, and `script` tools with Pi session
- [ ] Update TUI renderers for new consolidated tools
- [ ] Delete old files: `bash-restriction.ts`, `git-operation-tracker.ts`, related tests
- [ ] Integration tests with real Pi session

### Phase 6: Verification
- [ ] End-to-end test: full workflow (create script → run tests → commit → push)
- [ ] Verify all common workflows work without bash
- [ ] Verify script isolation (cannot run scripts outside .workhorse/scripts/)
- [ ] Update README.md documentation

## Open Questions

1. **Complex git operations** — How to handle rebase conflicts? Abort automatically after timeout? Escalate to human?

2. **Script pre-seeding** — Should we auto-generate common scripts from package.json on first run? Or require explicit `script { action: "init" }`?

3. **Script versioning** — Should scripts be committed to the repo? If so, add `.workhorse/scripts/` to recommended `.gitignore` or not?

4. **Cross-platform** — Scripts are `.sh` files. For Windows support, need `.ps1` or `.bat` variants?

## Success Criteria

1. Agent can complete full development workflow (branch → code → create scripts → run tests → commit → push) without bash
2. No arbitrary command execution — only scripts in `.workhorse/scripts/` can run
3. All scripts are files that can be reviewed, version-controlled, audited
4. Structured output improves agent reasoning (fewer token-wasting retries)
5. TUI shows clear, meaningful activity for all operations
6. Performance equivalent or better than v1 (no bash overhead)
