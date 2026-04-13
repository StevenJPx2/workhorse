# `src/cli` — Command-Line Interface

The **cli** module is the thin entry-point layer for Jiratown.  
It wires CLI arguments → interactive prompts → core SDK calls → optional TUI launch.

Built with [citty](https://github.com/unjs/citty) for command routing and [@clack/prompts](https://github.com/bombshell-dev/clack) for styled interactive prompts.

---

## Entry Point

```
src/cli/
├── index.ts              ← Main CLI entry (citty root command)
└── commands/
    ├── setup/            ← First-time setup wizard
    ├── add/              ← Quick-add a ticket from the command line
    ├── dashboard/        ← Launch the TUI dashboard
    └── cleanup/          ← Remove stale git worktrees
```

The binary is `dist/cli/index.js` (mapped as `jiratown` in `package.json#bin`).  
During development: `bun run src/cli/index.ts`.

---

## Commands

### `jiratown` (default — launches dashboard)

```bash
jiratown              # Context-aware: shows tickets for current repo only
jiratown --all        # Global view: shows all tickets across all repos
```

Calls `runDashboard({ all })` which initializes the TUI and mounts the `<App>` component via OpenTUI.

**How it works:**

1. Detects the current repo rig from `git remote get-url origin`
2. Loads config from `~/.jiratown/config.toml` (+ optional `.jiratown.toml`)
3. Opens the full OpenTUI terminal renderer with the Solid.js `<App>` component
4. The `--all` flag passes `showAll: true` to bypass rig filtering

---

### `jiratown setup`

Interactive first-time setup wizard using `@clack/prompts`.

**Steps performed:**

1. **Dependency check** — Verifies `bun`, `tmux`, `git`, `opencode`/`claude`, `npx` are present. Missing deps are listed with install hints. User may continue anyway.
2. **Jira cloud ID** — Prompted for `yourcompany.atlassian.net`. Validated to contain `.atlassian.net` or `.jira.com`.
3. **Default agent** — `opencode` (recommended) or `claude`.
4. **Save config** — Writes `~/.jiratown/config.toml` + initializes SQLite database at `~/.jiratown/jiratown.db`.
5. **Atlassian OAuth** — Optionally runs `npx -y mcp-remote https://mcp.atlassian.com/v1/mcp` to complete browser-based OAuth. Output is captured and tested for a successful connection.

**Files touched:** `~/.jiratown/config.toml`, `~/.jiratown/jiratown.db`

**Re-run behavior:** If config already exists, prompts to confirm reconfiguration before proceeding.

```bash
jiratown setup
```

---

### `jiratown add <ticket>`

Quick-add a ticket to the local database without launching the full TUI.

```bash
jiratown add AM-123
jiratown add AM-123 --agent claude
jiratown add https://mycompany.atlassian.net/browse/AM-123
jiratown add AM-123 --offline      # skip Jira fetch
```

**Steps performed:**

1. Validates setup has been run (config must exist).
2. Detects the current repo rig via `detectRig()`.
3. Parses and validates the ticket key (regex: `/^[A-Z][A-Z0-9]+-\d+$/i`). Accepts raw keys OR full Jira URLs.
4. Checks if ticket already exists in DB — offers to update if so.
5. Connects to Atlassian MCP and fetches issue details (`summary`, `status`, `issueType`, `url`).
6. Inserts the ticket into SQLite with `rig`, `jira_key`, `agent`, `jira_url`, `summary`.

**Output (success):**

```
✓ Ticket: AM-123
  Summary: Fix authentication timeout bug
  Status: In Progress
  Type: Story
  Rig: github.com/myorg/myproject
  Agent: opencode
  URL: https://mycompany.atlassian.net/browse/AM-123

◇ Run 'jiratown' to view and manage tickets.
```

**Parse logic (`parse-ticket.ts`):**

| Input | Parsed key | Parsed URL |
|---|---|---|
| `AM-123` | `AM-123` | `null` |
| `https://co.atlassian.net/browse/AM-123` | `AM-123` | full URL |
| `https://co.atlassian.net/browse/AM-123?...` | `AM-123` | URL without query params |

---

### `jiratown cleanup`

Removes stale git worktrees left behind by previous agent sessions.

```bash
jiratown cleanup               # Interactive multi-select
jiratown cleanup --all         # Remove all worktrees (no prompt)
jiratown cleanup --dry-run     # List what would be removed, no changes
jiratown cleanup --force       # Skip confirmation prompt
```

**Steps performed:**

1. Detects current repo via `getGitRoot()`.
2. Lists all worktrees via `listWorktrees(repoPath)`.
3. In interactive mode: renders a `@clack/prompts` `multiselect` showing ticket ID, branch, path.
4. Confirms removal (unless `--all` skips this).
5. Calls `removeWorktree(repoPath, ticketId, force: true)` for each selected worktree.
6. Reports how many were removed / failed.

**Programmatic API (for test teardown):**

```ts
import { cleanupWorktrees, cleanupTestWorktrees } from './commands/cleanup/run.ts';

// Remove specific worktrees
await cleanupWorktrees(repoPath, { ticketIds: ["TEST-1", "TEST-2"] });

// Remove all test worktrees (IDs starting with TEST-, containing -TEST or -FAIL)
await cleanupTestWorktrees(repoPath);
```

---

## Dependency Checking (`setup/dependencies.ts`)

The setup command checks for these dependencies:

| Dependency | Command | Install hint |
|---|---|---|
| `git` | `git --version` | Install from git-scm.com |
| `tmux` | `tmux -V` | `brew install tmux` / `apt install tmux` |
| `npx` | `npx --version` | Included with Node.js |

Each dependency is modeled as:

```ts
interface Dependency {
  name: string;
  command: string;
  args: string[];
  installHint?: string;
}
```

```ts
const { available, missing } = await checkAllDependencies();
```

---

## Atlassian Authentication (`setup/atlassian-auth.ts`)

Triggers the OAuth browser flow by spawning `npx -y mcp-remote https://mcp.atlassian.com/v1/mcp` and watching the output for success or an authorization URL.

```ts
const result: AuthResult = await authenticateAtlassian();
// { success: boolean, error?: string }

// Test if existing auth still works
const ok: boolean = await testAtlassianConnection();
```

The auth process is given `AUTH_TIMEOUT_MS` (30 seconds) to complete. The spawned process writes to stdout/stderr which is captured and searched for known success/failure tokens.

---

## Ticket Key Parsing (`commands/add/parse-ticket.ts`)

```ts
interface ParsedTicket {
  key: string;   // "AM-123"
  url: string | null;
}

parseTicketKey("AM-123")
// → { key: "AM-123", url: null }

parseTicketKey("https://company.atlassian.net/browse/AM-123?focusedCommentId=456")
// → { key: "AM-123", url: "https://company.atlassian.net/browse/AM-123" }

isValidTicketKey("AM-123")    // true
isValidTicketKey("am123")     // false
isValidTicketKey("A-1")       // true
```

The same logic exists in `src/tui/components/ticket-input/parse-ticket-key.ts` (for the TUI modal). Both implementations follow the same regex and normalization rules.

---

## Dashboard Launcher (`commands/dashboard/run.tsx`)

```ts
export interface DashboardOptions {
  all: boolean;
}

export async function runDashboard(options: DashboardOptions): Promise<void>
```

Renders the Solid.js `<App>` inside the OpenTUI terminal renderer. This is the only place in the CLI that imports from `src/tui`.

---

## Error Handling Convention

All command runners follow this pattern:

```ts
if (!configExists()) {
  p.log.error("Jiratown is not configured. Run 'jiratown setup' first.");
  process.exit(1);
}
```

- Use `p.log.error(message)` for fatal errors, then `process.exit(1)`.
- Use `p.log.warn(message)` for non-fatal warnings.
- Use `p.log.message(message)` for informational output.
- Use `p.spinner()` + `spinner.start/stop` for async operations.
- Use `p.isCancel(value)` to detect Ctrl+C during prompts.

---

## File Sizes

All files in `src/cli` comply with the **200-line maximum** rule. Command logic that exceeds this is extracted into separate files (e.g., `parse-ticket.ts`, `atlassian-auth.ts`, `dependencies.ts`).
