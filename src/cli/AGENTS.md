# Agent Instructions — `src/cli`

This file contains guidance for AI coding agents working inside the `src/cli` module.

---

## What This Module Is

`src/cli` is the **thin CLI entry layer** for Jiratown.  
Its job is to:

1. Parse CLI arguments and flags (via `citty`)
2. Run interactive prompts (via `@clack/prompts`)
3. Call `src/core` SDK functions for business logic
4. Optionally launch the TUI (`src/tui`) for the dashboard command

It should contain **minimal logic**. If you find yourself implementing business logic here, move it to `src/core`.

---

## The One Import Rule

`src/cli` may import from:
- `src/core` — for all business logic
- `src/tui` — **only** in `commands/dashboard/run.tsx` (the TUI launcher)
- `src/types` — for shared TypeScript types

`src/cli` must **never** be imported by `src/core` or `src/tui`.

---

## Adding a New Command

### Step 1 — Create the command directory

```
src/cli/commands/my-command/
├── index.ts      ← citty command definition + lazy import
├── command.ts    ← (optional) citty subcommand structure
└── run.ts        ← Command runner (the actual logic)
```

### Step 2 — Write `run.ts`

```ts
import * as p from "@clack/prompts";
import { someCoreFn } from "../../core/index.ts";

export async function runMyCommand(options: MyCommandOptions): Promise<void> {
  p.intro("My Command");

  // 1. Validate preconditions
  if (!configExists()) {
    p.log.error("Run 'jiratown setup' first.");
    process.exit(1);
  }

  // 2. Run interactive prompts
  const answer = await p.text({ message: "Enter something:" });
  if (p.isCancel(answer)) {
    p.outro("Cancelled.");
    return;
  }

  // 3. Do work (call core SDK)
  const spinner = p.spinner();
  spinner.start("Working...");
  try {
    await someCoreFn(answer);
    spinner.stop("Done!");
  } catch (error) {
    spinner.stop("Failed");
    p.log.error(String(error));
    process.exit(1);
  }

  p.outro("All done!");
}
```

### Step 3 — Write `index.ts`

```ts
import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "my-command", description: "Does something" },
  args: {
    flag: { type: "boolean", description: "A flag", default: false },
  },
  async run({ args }) {
    const { runMyCommand } = await import("./run.ts");
    await runMyCommand({ flag: args.flag });
  },
});
```

### Step 4 — Register in `cli/index.ts`

```ts
subCommands: {
  // ...existing
  "my-command": () => import("./commands/my-command/index.ts").then((m) => m.default),
},
```

---

## Interactive Prompt Patterns

Use `@clack/prompts` for all user interaction. Never use `console.log` directly in command runners — use the `p.*` API:

```ts
import * as p from "@clack/prompts";

// Lifecycle
p.intro("Title");
p.outro("Final message");

// Logging
p.log.success("Something worked");
p.log.error("Something failed");
p.log.warn("Something might be wrong");
p.log.message("Informational message");
p.log.step("Step header");

// Async progress
const spinner = p.spinner();
spinner.start("Loading...");
spinner.message("Still loading...");  // update message mid-spin
spinner.stop("Done!");                // or spinner.stop("Failed", 1) for error

// Prompts
const text = await p.text({ message: "Enter value:", placeholder: "...", validate: ... });
const confirmed = await p.confirm({ message: "Are you sure?", initialValue: false });
const selected = await p.select({ message: "Pick one:", options: [...] });
const multiSelected = await p.multiselect({ message: "Pick many:", options: [...] });

// Always check for cancel (Ctrl+C)
if (p.isCancel(text)) {
  p.outro("Cancelled.");
  return;
}
```

---

## Error Handling

Follow this consistent pattern:

```ts
// Fatal (unrecoverable) — exit with code 1
p.log.error("Not in a git repository.");
process.exit(1);

// Warning (recoverable) — continue with degraded mode
p.log.warn("Could not fetch from Jira. Continuing offline...");

// Spinner failure
spinner.stop("Failed to connect");
p.log.error(error instanceof Error ? error.message : String(error));
process.exit(1);
```

Never `throw` in a command runner — catch errors and use `p.log.error` + `process.exit(1)`.

---

## Ticket Key Parsing

When accepting a Jira ticket from the user, always use `parseTicketKey` from `./parse-ticket.ts`:

```ts
import { parseTicketKey, isValidTicketKey } from "./parse-ticket.ts";

const { key, url } = parseTicketKey(rawInput);

if (!isValidTicketKey(key)) {
  p.log.error(`Invalid ticket key: "${key}". Expected format: AM-123`);
  process.exit(1);
}
```

This handles:
- Plain keys: `AM-123`
- Full Jira URLs: `https://company.atlassian.net/browse/AM-123`
- URLs with query params (strips them)

---

## Atlassian Client Usage

When you need to fetch Jira data in a CLI command, use `createAtlassianClient` from the tui hooks (it's shared):

```ts
import { createAtlassianClient } from "../../tui/hooks/use-atlassian/index.ts";

const config = await loadConfig();
const client = createAtlassianClient({ cloudId: config.jira.cloud_id });

await client.connect();
const issue = await client.fetchIssue(ticketKey);
await client.disconnect();
```

Always `connect()` before use and `disconnect()` when done. In a CLI context there's no auto-cleanup (unlike the hook which uses `onCleanup`).

---

## File Size Rule

**No file may exceed 200 lines.** If a command runner grows beyond this:

- Extract `parseXxx` helpers into their own file
- Extract `checkXxx` validators into their own file
- Extract auth/connection logic into their own file (see `atlassian-auth.ts`, `dependencies.ts`)

---

## Testing Commands

Test files go alongside source files: `run.test.ts` next to `run.ts`.

In tests, mock external dependencies at the boundary:

```ts
import { mock } from "bun:test";

// Mock core SDK functions
mock.module("../../core/index.ts", () => ({
  configExists: () => true,
  detectRig: async () => ({ rig: "github.com/user/repo", gitRoot: "/tmp" }),
  loadConfig: async () => ({ jira: { cloud_id: "test.atlassian.net" }, defaults: { agent: "opencode" } }),
  insertTicket: (t: Ticket) => ({ ...t, status: "pending", created_at: "2024-01-01" }),
  // ...
}));

// Mock process.exit to prevent test termination
const exitSpy = mock(() => {});
process.exit = exitSpy as any;
```

For `@clack/prompts`, mock the whole module:

```ts
mock.module("@clack/prompts", () => ({
  intro: () => {},
  outro: () => {},
  log: { success: () => {}, error: () => {}, warn: () => {}, message: () => {} },
  spinner: () => ({ start: () => {}, stop: () => {}, message: () => {} }),
  text: async () => "AM-123",
  confirm: async () => true,
  isCancel: () => false,
}));
```

---

## Coverage Requirement

**97% code coverage required.** Every code path in `run.ts` files must be tested, including:

- Happy path
- Cancel / Ctrl+C paths (`p.isCancel` returns true)
- Missing config / not in git repo
- Jira fetch failures (offline mode)
- Invalid input validation
