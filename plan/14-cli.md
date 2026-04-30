# Step 13: CLI

Command-line interface for Jiratown. Thin wrapper over core APIs — no business logic, just argument parsing and output formatting.

**Location:** `packages/cli/` (standalone package: `@jiratown/cli`)

**External deps:** `citty`, `@clack/prompts`

- **citty** — Lightweight CLI argument parsing from UnJS (same ecosystem as `unctx`)
- **@clack/prompts** — Beautiful terminal output: spinners, styled logs, notes, intro/outro

## File Structure

```
packages/cli/
├── package.json
├── bin/
│   └── jiratown.ts           # Entry point, #!/usr/bin/env bun
└── src/
    ├── index.ts              # CLI setup, command registration
    ├── commands/
    │   ├── spawn.ts          # jiratown spawn <issue>
    │   ├── stop.ts           # jiratown stop <issue>
    │   ├── list.ts           # jiratown list
    │   ├── status.ts         # jiratown status <issue>
    │   ├── send.ts           # jiratown send <issue> <message>
    │   ├── config.ts         # jiratown config [key] [value]
    │   ├── auth.ts           # jiratown auth <provider>
    │   └── plugin.ts         # jiratown plugin list|enable|disable
    ├── output/
    │   └── formatters.ts     # Table, JSON formatters (clack handles the rest)
    ├── context.ts            # CLI-specific bootstrap (creates JiratownContext)
    └── __tests__/
        ├── spawn.test.ts
        ├── stop.test.ts
        ├── list.test.ts
        └── output.test.ts
```

> **Note:** Clack provides spinners, styled logs, notes, and colors out of the box — no separate `spinner.ts` or `colors.ts` needed.

## Commands

### `jiratown spawn <issue>`

Start an agent on an issue. The issue can be any supported format (Jira key, GitHub ref, URL).

```bash
jiratown spawn AM-123
jiratown spawn owner/repo#45
jiratown spawn https://github.com/owner/repo/issues/123
```

**Options:**
- `--harness <name>` — Override default harness (pi-coding-agent, claude-code, etc.)
- `--model <model>` — Override default model
- `--base <branch>` — Base branch for worktree (default: main)
- `--repo <path>` — Repository path (default: cwd)
- `--prompt <text>` — Custom initial prompt (overrides auto-generated)
- `--json` — Output JSON instead of human-readable

**Flow:**
1. Parse issue via Tracker
2. Call `orchestrator.spawn()`
3. Stream `agent.output` events to stdout
4. On error, print and exit non-zero

```typescript
// commands/spawn.ts
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { createContext } from "../context.ts";

export const spawnCommand = defineCommand({
  meta: { name: "spawn", description: "Start an agent on an issue" },
  args: {
    issue: { type: "positional", description: "Issue identifier (e.g., AM-123, owner/repo#45)", required: true },
    harness: { type: "string", alias: "h", description: "Agent harness to use" },
    model: { type: "string", alias: "m", description: "Model to use" },
    base: { type: "string", alias: "b", default: "main", description: "Base branch" },
    repo: { type: "string", alias: "r", description: "Repository path" },
    prompt: { type: "string", alias: "p", description: "Custom initial prompt" },
    json: { type: "boolean", description: "Output JSON" },
  },
  async run({ args }) {
    p.intro("jiratown spawn");

    const ctx = await createContext();
    const s = p.spinner();

    try {
      s.start("Parsing issue...");
      const issue = await ctx.tracker.parse(args.issue);

      s.message(`Starting agent on ${issue.externalId}...`);
      const adapter = await ctx.orchestrator.spawn({
        issue,
        harness: args.harness,
        model: args.model,
        baseBranch: args.base,
        repoPath: args.repo ?? process.cwd(),
        prompt: args.prompt,
      });

      s.stop(`Agent started: ${adapter.worktreePath}`);

      // Stream output
      ctx.hooks.on("agent.output", ({ issueId, delta }) => {
        if (issueId === issue.externalId) {
          process.stdout.write(delta);
        }
      });

      // Keep alive until agent stops
      await new Promise((resolve) => {
        ctx.hooks.on("orchestrator.stop.post", ({ adapter: a }) => {
          if (a.issueId === issue.externalId) resolve(undefined);
        });
      });

      p.outro("Agent completed");
    } catch (err) {
      s.stop("Failed");
      p.log.error(err instanceof Error ? err.message : String(err));
      p.cancel("Spawn failed");
      process.exit(1);
    }
  },
});
```

### `jiratown stop <issue>`

Stop an agent.

```bash
jiratown stop AM-123
jiratown stop --all
```

**Options:**
- `--all` — Stop all running agents
- `--remove-worktree` — Also delete the worktree
- `--force` — Don't wait for graceful shutdown

### `jiratown list`

List all running agents.

```bash
jiratown list
jiratown list --json
jiratown list --status running
```

**Options:**
- `--json` — Output JSON
- `--status <state>` — Filter by state (running, stopped, crashed)

**Output:**
```
ISSUE           HARNESS           STATUS    WORKTREE
AM-123          pi-coding-agent   running   ../jiratown-worktrees/AM-123
PROJ-456        claude-code       stopped   ../jiratown-worktrees/PROJ-456
owner/repo#45   pi-coding-agent   running   ../jiratown-worktrees/owner-repo-45
```

### `jiratown status <issue>`

Get detailed status of an agent.

```bash
jiratown status AM-123
```

**Output:**
```
Issue:        AM-123 — Fix the login bug
Status:       running
Harness:      pi-coding-agent
Model:        claude-sonnet-4-20250514
Worktree:     ../jiratown-worktrees/AM-123
Branch:       fix/AM-123
Started:      2025-01-15 10:30:00 (2h 15m ago)

Notifications: 2 pending
  • [HIGH] Review requested changes on #45
  • [NORMAL] New comment from @alice

Recent Activity:
  10:32  Tool: jiratown_acknowledge
  10:35  Tool: github_open_pr
  10:40  Tool: jira_transition_issue
```

### `jiratown send <issue> <message>`

Send a message to a running agent (steer or prompt).

```bash
jiratown send AM-123 "Focus on the unit tests first"
jiratown send AM-123 --file ./instructions.md
```

**Options:**
- `--file <path>` — Read message from file
- `--steer` — Force steer mode (interrupt streaming)

### `jiratown config`

View or modify configuration.

```bash
jiratown config                          # Show all config
jiratown config agent.harness            # Show specific key
jiratown config agent.harness claude-code # Set value
jiratown config --edit                   # Open in $EDITOR
jiratown config --path                   # Print config file path
```

### `jiratown auth <provider>`

Authenticate with a provider.

```bash
jiratown auth jira      # Start Jira OAuth flow
jiratown auth github    # Verify gh CLI auth
jiratown auth --status  # Show auth status for all providers
```

### `jiratown plugin`

Manage plugins.

```bash
jiratown plugin list              # List all plugins
jiratown plugin enable <name>     # Enable a plugin
jiratown plugin disable <name>    # Disable a plugin
jiratown plugin install <package> # Install from npm (future)
```

## Output Formatting

Clack provides most output utilities out of the box. We only need a custom `formatters.ts` for tabular data.

### Clack Utilities (built-in)

```typescript
import * as p from "@clack/prompts";

// Session boundaries
p.intro("jiratown spawn");
p.outro("Done!");

// Semantic logging
p.log.info("Starting...");
p.log.success("Completed!");
p.log.warn("Deprecated API");
p.log.error("Failed to connect");
p.log.step("Loading config");

// Boxed notes (great for hints, next steps)
p.note("cd my-project\nnpm run dev", "Next steps");

// Spinner for async operations
const s = p.spinner();
s.start("Loading...");
s.message("Still working...");
s.stop("Done!");

// Cancellation
p.cancel("Operation cancelled");
```

### Custom Formatters

```typescript
// output/formatters.ts
export function table(headers: string[], rows: string[][]): string
export function json<T>(data: T): string
```

Table formatting is the only thing Clack doesn't provide — we'll implement a simple column-aligned formatter.

## CLI Context

```typescript
// context.ts
import { bootstrap, type JiratownContext } from "@jiratown/core";
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";
import { jiraPlugin } from "@jiratown/plugin-jira";
import { githubPlugin } from "@jiratown/plugin-github";

let ctx: JiratownContext | null = null;

export async function createContext(): Promise<JiratownContext> {
  if (ctx) return ctx;

  ctx = await bootstrap({
    plugins: [piAdapterPlugin, jiraPlugin, githubPlugin],
  });

  return ctx;
}

export async function destroyContext(): Promise<void> {
  if (ctx) {
    await ctx.orchestrator.shutdown();
    ctx = null;
  }
}
```

## Global Options

All commands support:
- `--verbose, -v` — Verbose output (debug logs)
- `--quiet, -q` — Suppress non-essential output
- `--json` — Output JSON (machine-readable)
- `--config <path>` — Override config file path
- `--help, -h` — Show help
- `--version` — Show version

## Entry Point

```typescript
// bin/jiratown.ts
#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { version } from "../package.json";
import {
  spawnCommand,
  stopCommand,
  listCommand,
  statusCommand,
  sendCommand,
  configCommand,
  authCommand,
  pluginCommand,
} from "../src/commands/index.ts";
import { destroyContext } from "../src/context.ts";

const main = defineCommand({
  meta: {
    name: "jiratown",
    version,
    description: "AI agent orchestration for issue tracking",
  },
  args: {
    verbose: { type: "boolean", alias: "v", description: "Verbose output" },
    quiet: { type: "boolean", alias: "q", description: "Suppress non-essential output" },
    config: { type: "string", description: "Config file path" },
  },
  subCommands: {
    spawn: spawnCommand,
    stop: stopCommand,
    list: listCommand,
    status: statusCommand,
    send: sendCommand,
    config: configCommand,
    auth: authCommand,
    plugin: pluginCommand,
  },
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await destroyContext();
  process.exit(0);
});

runMain(main);
```

## package.json

```json
{
  "name": "@jiratown/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "jiratown": "./bin/jiratown.ts"
  },
  "dependencies": {
    "@jiratown/core": "workspace:*",
    "@jiratown/plugin-pi-adapter": "workspace:*",
    "@jiratown/plugin-jira": "workspace:*",
    "@jiratown/plugin-github": "workspace:*",
    "@clack/prompts": "^0.10.0",
    "citty": "^0.1.6"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

## Error Handling

```typescript
import * as p from "@clack/prompts";
import { JiratownError } from "@jiratown/core";

// Consistent error output using Clack
function handleError(err: unknown): never {
  if (err instanceof JiratownError) {
    p.log.error(err.message);
    if (err.hint) {
      p.note(err.hint, "Hint");
    }
  } else if (err instanceof Error) {
    p.log.error(err.message);
  } else {
    p.log.error(String(err));
  }
  p.cancel("Operation failed");
  process.exit(1);
}
```

## Tests

- **spawn**: parses issue, calls orchestrator, streams output, handles errors
- **stop**: stops agent, optionally removes worktree, handles --all
- **list**: formats table correctly, respects --json, filters by status
- **status**: shows detailed info, formats notifications
- **send**: sends message, handles file input
- **config**: reads/writes config, validates keys
- **formatters**: table alignment, JSON output, color application

## Future Commands

- `jiratown logs <issue>` — Stream or tail agent logs
- `jiratown resume <issue>` — Resume a stopped agent
- `jiratown worktree list` — List all worktrees
- `jiratown worktree clean` — Clean up orphaned worktrees
- `jiratown init` — Initialize Jiratown in a project
