# Step 13: CLI

Command-line interface for Jiratown. Thin wrapper over core APIs — no business logic, just argument parsing and output formatting.

**Location:** `packages/cli/` (standalone package: `@jiratown/cli`)

**External deps:** `commander`, `picocolors`, `ora`

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
    │   ├── formatters.ts     # Table, JSON, pretty output formatters
    │   ├── spinner.ts        # Progress indicators (ora wrapper)
    │   └── colors.ts         # Consistent color scheme (picocolors)
    ├── context.ts            # CLI-specific bootstrap (creates JiratownContext)
    └── __tests__/
        ├── spawn.test.ts
        ├── stop.test.ts
        ├── list.test.ts
        └── output.test.ts
```

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
import { Command } from "commander";
import { createContext } from "../context.ts";
import { spinner, success, error } from "../output/index.ts";

export const spawnCommand = new Command("spawn")
  .description("Start an agent on an issue")
  .argument("<issue>", "Issue identifier (e.g., AM-123, owner/repo#45)")
  .option("-h, --harness <name>", "Agent harness to use")
  .option("-m, --model <model>", "Model to use")
  .option("-b, --base <branch>", "Base branch", "main")
  .option("-r, --repo <path>", "Repository path", process.cwd())
  .option("-p, --prompt <text>", "Custom initial prompt")
  .option("--json", "Output JSON")
  .action(async (issueRef, options) => {
    const ctx = await createContext();
    const spin = spinner("Parsing issue...");

    try {
      const issue = await ctx.tracker.parse(issueRef);
      spin.text = `Starting agent on ${issue.externalId}...`;

      const adapter = await ctx.orchestrator.spawn({
        issue,
        harness: options.harness,
        model: options.model,
        baseBranch: options.base,
        repoPath: options.repo,
        prompt: options.prompt,
      });

      spin.succeed(`Agent started: ${adapter.worktreePath}`);

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
    } catch (err) {
      spin.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
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

### Formatters

```typescript
// output/formatters.ts
export function table(headers: string[], rows: string[][]): string
export function json<T>(data: T): string
export function keyValue(pairs: Record<string, string>): string
export function list(items: string[], bullet?: string): string
```

### Colors

```typescript
// output/colors.ts
import pc from "picocolors";

export const theme = {
  success: pc.green,
  error: pc.red,
  warning: pc.yellow,
  info: pc.blue,
  dim: pc.dim,
  bold: pc.bold,
  issue: pc.cyan,
  status: {
    running: pc.green,
    stopped: pc.dim,
    crashed: pc.red,
    starting: pc.yellow,
    stopping: pc.yellow,
  },
  priority: {
    high: pc.red,
    normal: pc.yellow,
    low: pc.dim,
  },
};
```

### Spinner

```typescript
// output/spinner.ts
import ora from "ora";

export function spinner(text: string) {
  return ora({ text, spinner: "dots" }).start();
}
```

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
import { program } from "commander";
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

program
  .name("jiratown")
  .description("AI agent orchestration for issue tracking")
  .version(version)
  .option("-v, --verbose", "Verbose output")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("--config <path>", "Config file path");

program.addCommand(spawnCommand);
program.addCommand(stopCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(sendCommand);
program.addCommand(configCommand);
program.addCommand(authCommand);
program.addCommand(pluginCommand);

// Graceful shutdown
process.on("SIGINT", async () => {
  await destroyContext();
  process.exit(0);
});

program.parse();
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
    "commander": "^13.0.0",
    "picocolors": "^1.1.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

## Error Handling

```typescript
// Consistent error output
function handleError(err: unknown): never {
  if (err instanceof JiratownError) {
    console.error(theme.error(`Error: ${err.message}`));
    if (err.hint) {
      console.error(theme.dim(`Hint: ${err.hint}`));
    }
  } else if (err instanceof Error) {
    console.error(theme.error(`Error: ${err.message}`));
  } else {
    console.error(theme.error(`Error: ${String(err)}`));
  }
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
