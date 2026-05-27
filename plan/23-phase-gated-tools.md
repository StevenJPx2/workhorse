# Plan 23: Status-Gated Tool Access

Restrict tool availability based on the current workflow status. During planning, only non-destructive tools are accessible. Destructive tools (edit, write, git commit, etc.) are only available during implementation.

## Motivation

### Why Status-Gate Tools?

1. **Safety during planning** — Agents shouldn't accidentally edit files while exploring/planning
2. **Clearer workflow stages** — Forces explicit transition from "thinking" to "doing"
3. **Reduced mistakes** — Prevents premature edits before understanding the full scope
4. **Auditability** — Clear delineation between exploration and modification
5. **Human oversight** — Can require approval before entering destructive statuses

### Current Problem

Today, agents have all tools available at all times. This leads to:
- Editing files before fully understanding requirements
- Mixing exploration (reading) with implementation (writing) haphazardly
- No clear "point of no return" where destructive actions begin
- Harder to review — unclear which actions were exploration vs. implementation

## Design

### Workflow Statuses

Workhorse already has issue statuses. We extend this to control tool availability:

| Status | Description | Example Tools Available |
|--------|-------------|------------------------|
| `pending` | Not yet started | Read-only |
| `queued` | Waiting to be picked up | Read-only |
| `planning` | Understanding requirements, exploring codebase | Read, Grep, Glob, git status/diff/log |
| `implementing` | Writing code, making changes | All tools |
| `blocked` | Waiting for human input | Read, communicate |
| `in_review` | Self-review, checking work | Read, git diff, communicate |
| `done` | Work finished | Read-only |

### Tool `status` Parameter

Each tool declares which statuses it's available in via a `status` field:

```typescript
type ToolStatus<TArgs = unknown> = 
  | IssueStatus                                    // Single status
  | IssueStatus[]                                  // Array of statuses
  | ((args: TArgs) => IssueStatus | IssueStatus[]) // Dynamic based on args

interface OrchestratorTool<TArgs = unknown> {
  name: string;
  description: string;
  schema: JsonSchema;
  
  // Statuses where this tool is available
  // If omitted, tool is available in ALL statuses (backward compatible)
  status?: ToolStatus<TArgs>;
  
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<Result>;
}
```

**Benefits:**
- Simple — single field, multiple forms
- Flexible — static string, array, or dynamic function
- No category abstraction layer
- Easy to understand at a glance
- Plugins define their own status restrictions
- Uses existing Workhorse status names

### Tool Definitions with Status

```typescript
// Read-only tools — available in all statuses
orchestrator.registerTool({
  name: "Read",
  status: ["planning", "implementing", "in_review", "blocked", "done"],
  // ... or omit status entirely for "all statuses"
});

// Write tools — only during implementation
orchestrator.registerTool({
  name: "Write",
  status: ["implementing"],
  // ...
});

orchestrator.registerTool({
  name: "Edit", 
  status: ["implementing"],
  // ...
});

// Git — dynamic status based on action
orchestrator.registerTool({
  name: "git",
  status: (args) => {
    const readActions = ["status", "diff", "log", "branch"];
    if (readActions.includes(args.action)) {
      return STATUS.READ_ONLY;
    }
    return "implementing";
  },
  // ...
});

// Communication tools — available when blocked too
orchestrator.registerTool({
  name: "workhorse_escalate",
  status: ["planning", "implementing", "in_review", "blocked"],
  // ...
});
```

### Shorthand Constants

For convenience, define common status sets:

```typescript
// packages/core/src/workflow/orchestrator/status-sets.ts
export const STATUS = {
  // All statuses
  ALL: ["pending", "queued", "planning", "implementing", "in_review", "blocked", "done"] as const,
  
  // Read-only access
  READ_ONLY: ["pending", "queued", "planning", "implementing", "in_review", "blocked", "done"] as const,
  
  // Can modify files/state
  WRITE: ["implementing"] as const,
  
  // Can communicate (escalate, comment, etc.)
  COMMUNICATE: ["planning", "implementing", "in_review", "blocked"] as const,
  
  // Active work (not done)
  ACTIVE: ["planning", "implementing", "in_review", "blocked"] as const,
};

// Usage
orchestrator.registerTool({
  name: "Read",
  status: STATUS.READ_ONLY,
  // ...
});

orchestrator.registerTool({
  name: "Edit",
  status: STATUS.WRITE,
  // ...
});
```

## Implementation

### 1. Extend OrchestratorTool Interface

```typescript
// packages/core/src/workflow/orchestrator/types.ts
import type { IssueStatus } from "../../db/schema";

export type ToolStatus<TArgs = unknown> = 
  | IssueStatus
  | IssueStatus[]
  | ((args: TArgs) => IssueStatus | IssueStatus[]);

export interface OrchestratorTool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema: JsonSchema;
  
  // Statuses where this tool is available
  // If omitted, tool is available in ALL statuses
  status?: ToolStatus<TArgs>;
  
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<TResult>;
}
```

### 2. Tool Filter Implementation

Simple filter that checks tool availability:

```typescript
// packages/core/src/workflow/orchestrator/tool-filter.ts
import type { IssueStatus } from "../../db/schema";
import type { OrchestratorTool, ToolStatus } from "./types";

// Helper to resolve status to array
function resolveStatus<T>(status: ToolStatus<T> | undefined, args: T): IssueStatus[] {
  if (!status) return []; // No restriction
  if (typeof status === "string") return [status];
  if (Array.isArray(status)) return status;
  if (typeof status === "function") {
    const result = status(args);
    return typeof result === "string" ? [result] : result;
  }
  return [];
}

export class StatusToolFilter {
  constructor(
    private getAllTools: () => OrchestratorTool[],
    private getCurrentStatus: () => IssueStatus
  ) {}
  
  // Get tools available for current status (static check only)
  getAvailableTools(): OrchestratorTool[] {
    const currentStatus = this.getCurrentStatus();
    
    return this.getAllTools().filter(tool => {
      // No restriction = always available
      if (!tool.status) return true;
      
      // Functions are included but checked at execution time
      if (typeof tool.status === "function") return true;
      
      // Static string or array
      const allowed = typeof tool.status === "string" 
        ? [tool.status] 
        : tool.status;
      return allowed.includes(currentStatus);
    });
  }
  
  // Check if a specific tool call is allowed
  canExecute(tool: OrchestratorTool, args: unknown): boolean {
    if (!tool.status) return true; // No restriction
    
    const currentStatus = this.getCurrentStatus();
    const allowed = resolveStatus(tool.status, args);
    
    return allowed.length === 0 || allowed.includes(currentStatus);
  }
  
  // Get reason why tool is blocked
  getBlockReason(tool: OrchestratorTool, args: unknown): string | null {
    if (this.canExecute(tool, args)) return null;
    
    const currentStatus = this.getCurrentStatus();
    const allowed = resolveStatus(tool.status, args);
    
    return `Tool "${tool.name}" is not available during "${currentStatus}" status. ` +
           `Allowed: ${allowed.join(", ")}. ` +
           `Use workhorse_update_status to transition.`;
  }
}
```

### 3. Integration with Tool Execution

Wrap tool execution to check status:

```typescript
// packages/core/src/workflow/orchestrator/harness.ts
async function executeToolWithStatusCheck(
  tool: OrchestratorTool,
  args: unknown,
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  const filter = ctx.adapter.toolFilter;
  
  if (!filter.canExecute(tool, args)) {
    const reason = filter.getBlockReason(tool, args);
    const currentStatus = ctx.issue.status;
    
    return {
      success: false,
      error: reason,
      hint: currentStatus === "planning"
        ? "Use workhorse_update_status { status: 'implementing' } when ready to make changes."
        : `Current status "${currentStatus}" does not allow this operation.`
    };
  }
  
  return tool.execute(args, ctx);
}
```

### 4. Add workhorse_plan Tool

A planning-only tool that helps agents create a structured to-do list before transitioning to implementation. This enforces deliberate planning and creates a checklist the agent can reference during implementation.

```typescript
// packages/core/src/plugins/builtin/tools/plan.ts
import type { OrchestratorTool } from "../../../workflow/orchestrator/types";

interface PlanItem {
  task: string;
  files?: string[];       // Files expected to be created/modified
  details?: string;       // Implementation notes
}

interface PlanArgs {
  action: "create" | "view" | "update";
  items?: PlanItem[];     // For create/update
  summary?: string;       // High-level summary of approach
}

export const planTool: OrchestratorTool<PlanArgs> = {
  name: "workhorse_plan",
  description: `Create or update an implementation plan before transitioning to implementing status.

Use this tool during planning to:
1. Document your understanding of the requirements
2. Break down the work into discrete tasks
3. Identify files that need to be created or modified
4. Note any decisions or approaches

The plan is saved to .workhorse/plan.md in the worktree and will be:
- Included in your prompt when you transition to implementing
- Available for reference during implementation
- Used to track progress as you complete tasks

Actions:
- create: Create a new plan (replaces existing)
- view: View the current plan
- update: Add or modify items in the existing plan`,
  status: ["planning"], // Only available during planning
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "view", "update"],
        description: "Action to perform"
      },
      summary: {
        type: "string",
        description: "High-level summary of your approach (for create/update)"
      },
      items: {
        type: "array",
        description: "List of tasks to complete",
        items: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "Description of the task"
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "Files to create or modify for this task"
            },
            details: {
              type: "string", 
              description: "Implementation notes or approach"
            }
          },
          required: ["task"]
        }
      }
    },
    required: ["action"]
  },
  execute: async (args, ctx) => {
    const planPath = path.join(ctx.worktreePath, ".workhorse", "plan.md");
    
    switch (args.action) {
      case "view": {
        if (!await exists(planPath)) {
          return {
            success: true,
            plan: null,
            message: "No plan exists yet. Use action: 'create' to create one."
          };
        }
        const content = await Bun.file(planPath).text();
        return { success: true, plan: content };
      }
      
      case "create":
      case "update": {
        if (!args.items || args.items.length === 0) {
          return {
            success: false,
            error: "items array is required for create/update"
          };
        }
        
        const markdown = generatePlanMarkdown(args.summary, args.items, ctx.issue);
        await ensureDir(path.dirname(planPath));
        await Bun.write(planPath, markdown);
        
        return {
          success: true,
          message: `Plan ${args.action === "create" ? "created" : "updated"} with ${args.items.length} tasks.`,
          path: planPath,
          hint: "When ready to implement: workhorse_update_status { status: 'implementing' }"
        };
      }
    }
  }
};

function generatePlanMarkdown(
  summary: string | undefined, 
  items: PlanItem[], 
  issue: Issue
): string {
  const lines: string[] = [];
  
  lines.push(`# Implementation Plan: ${issue.externalId}`);
  lines.push("");
  lines.push(`**Issue:** ${issue.title}`);
  lines.push(`**Created:** ${new Date().toISOString()}`);
  lines.push("");
  
  if (summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(summary);
    lines.push("");
  }
  
  lines.push("## Tasks");
  lines.push("");
  
  for (const item of items) {
    lines.push(`- [ ] ${item.task}`);
    if (item.files && item.files.length > 0) {
      lines.push(`  - Files: ${item.files.join(", ")}`);
    }
    if (item.details) {
      lines.push(`  - Notes: ${item.details}`);
    }
  }
  
  lines.push("");
  lines.push("---");
  lines.push("*This plan was created during the planning phase.*");
  
  return lines.join("\n");
}
```

**Key features:**
- **Planning-only** — Only available in `planning` status, enforcing the workflow
- **Structured output** — Generates markdown checklist the agent can reference
- **File tracking** — Agent documents which files it expects to modify
- **Persisted** — Saved to `.workhorse/plan.md` in the worktree
- **Prompt integration** — Plan is injected into prompt when status changes to `implementing`

**Workflow:**
1. Agent enters `planning` status
2. Agent explores codebase with Read, Grep, Glob
3. Agent creates plan with `workhorse_plan { action: "create", items: [...] }`
4. Agent transitions with `workhorse_update_status { status: "implementing" }`
5. Plan is included in agent's prompt for reference
6. Agent works through tasks, checking them off

### 5. Add workhorse_list_tools Tool

A dedicated tool to show available tools for the current status. Useful when:
- Agent is unsure what tools it can use
- Agent wants to check before attempting an action
- After resuming a session (may not remember current status)

```typescript
// packages/core/src/plugins/builtin/tools/list-tools.ts
export const listToolsTool: OrchestratorTool = {
  name: "workhorse_list_tools",
  description: "List all tools available in the current status. Use this to check what actions you can perform.",
  status: STATUS.ALL, // Always available
  schema: {
    type: "object",
    properties: {},
    required: []
  },
  execute: async (_args, ctx) => {
    const currentStatus = ctx.issue.status;
    const availableTools = ctx.toolFilter.getAvailableToolNames(currentStatus);
    const toolAccessMessage = buildToolAccessMessage(currentStatus, availableTools);
    
    return {
      success: true,
      status: currentStatus,
      availableTools,
      toolAccess: toolAccessMessage
    };
  }
};
```

### 5. Update workhorse_update_status Tool

The existing `workhorse_update_status` tool already handles status transitions. We extend it to return available tools directly in the response — the agent reads tool responses, so this is the natural feedback loop.

```typescript
// packages/core/src/plugins/builtin/tools/update-status.ts
export const updateStatusTool: OrchestratorTool = {
  name: "workhorse_update_status",
  description: "Update the issue status. Use 'implementing' when ready to start making changes.",
  status: STATUS.ACTIVE, // Available in all active statuses (not 'done')
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["planning", "implementing", "in_review", "blocked", "done"],
        description: "New status for the issue"
      },
      reason: {
        type: "string", 
        description: "Brief explanation for the status change"
      }
    },
    required: ["status"]
  },
  execute: async ({ status, reason }, ctx) => {
    const from = ctx.issue.status;
    
    // Validate transition
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(status)) {
      return {
        success: false,
        error: `Cannot transition from "${from}" to "${status}". Allowed: ${allowed.join(", ")}`
      };
    }
    
    await ctx.db.issues.updateStatus(ctx.issue.id, status);
    
    // Get tools now available in the new status
    const availableTools = ctx.toolFilter.getAvailableToolNames(status);
    const toolAccessMessage = buildToolAccessMessage(status, availableTools);
    
    ctx.hooks.emit("issue.status_changed", {
      issue: ctx.issue,
      from,
      to: status,
      reason
    });
    
    return {
      success: true,
      from,
      to: status,
      message: `Status changed from "${from}" to "${status}"${reason ? `: ${reason}` : ""}`,
      // Include available tools in response — agent reads this directly
      availableTools,
      toolAccess: toolAccessMessage
    };
  }
};

// Helper to build tool change message
function buildToolChangeMessage(
  from: IssueStatus, 
  to: IssueStatus, 
  availableTools: string[]
): string {
  const lines: string[] = [];
  
  lines.push(`## Status Changed: ${from} → ${to}`);
  lines.push("");
  
  switch (to) {
    case "planning":
      lines.push("**Read-only mode.** You can explore but cannot modify files.");
      lines.push("");
      lines.push("Available tools:");
      lines.push("- Read, Grep, Glob — file exploration");
      lines.push("- git (status, diff, log) — repository state");
      lines.push("- workhorse_escalate — ask for clarification");
      lines.push("");
      lines.push("When ready to implement: `workhorse_update_status { status: 'implementing' }`");
      break;
      
    case "implementing":
      lines.push("**Full access.** You can now modify files and run scripts.");
      lines.push("");
      lines.push("Newly available tools:");
      lines.push("- Write, Edit — file modifications");
      lines.push("- git (add, commit, checkout, etc.) — version control");
      lines.push("- project (install, add, remove) — package management");
      lines.push("- script (create, run) — script execution");
      lines.push("");
      lines.push("When changes complete: `workhorse_update_status { status: 'in_review' }`");
      break;
      
    case "in_review":
      lines.push("**Review mode.** Verify your changes work correctly.");
      lines.push("");
      lines.push("Available tools:");
      lines.push("- Read, Grep, Glob — verify changes");
      lines.push("- git (status, diff, log) — review commits");
      lines.push("- script (run) — run tests");
      lines.push("");
      lines.push("If fixes needed: `workhorse_update_status { status: 'implementing' }`");
      lines.push("If complete: `workhorse_update_status { status: 'done' }`");
      break;
      
    case "blocked":
      lines.push("**Blocked.** Waiting for human input.");
      lines.push("");
      lines.push("Available: Read-only tools + communication (escalate, comments).");
      lines.push("Cannot modify files until unblocked.");
      break;
      
    case "done":
      lines.push("**Done.** Work complete, read-only access.");
      break;
  }
  
  lines.push("");
  lines.push(`All available tools: ${availableTools.join(", ")}`);
  
  return lines.join("\n");
}

// Valid status transitions
const VALID_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  planning: ["implementing", "blocked", "done"],
  implementing: ["in_review", "blocked", "done"],
  in_review: ["implementing", "blocked", "done"],
  blocked: ["planning", "implementing", "in_review", "done"],
  done: [], // Terminal
};
```

### 5. System Prompt Injection

Add status context to agent prompts:

```typescript
// packages/core/src/workflow/tracker/prompt-engineer.ts
function buildStatusContext(status: IssueStatus, availableTools: string[]): string {
  const lines: string[] = [];
  
  lines.push(`## Current Status: ${status.toUpperCase()}`);
  lines.push("");
  
  switch (status) {
    case "planning":
      lines.push("You are in **planning** status. You can:");
      lines.push("- Read and explore files");
      lines.push("- Check git status and history");
      lines.push("- Communicate (escalate, update_status)");
      lines.push("");
      lines.push("You CANNOT edit files or run commands yet.");
      lines.push("When ready: `workhorse_update_status { status: 'in_progress' }`");
      break;
      
    case "in_progress":
      lines.push("You are **in_progress**. All tools are available.");
      lines.push("When changes are complete: `workhorse_update_status { status: 'in_review' }`");
      break;
      
    case "in_review":
      lines.push("You are **in_review**. You can:");
      lines.push("- Review your changes");
      lines.push("- Verify tests pass");
      lines.push("");
      lines.push("If changes needed: `workhorse_update_status { status: 'in_progress' }`");
      lines.push("If complete: `workhorse_update_status { status: 'done' }`");
      break;
      
    case "blocked":
      lines.push("You are **blocked** waiting for human input.");
      lines.push("You can explore and communicate, but cannot make changes.");
      break;
      
    case "done":
      lines.push("Work is **done**. Read-only access.");
      break;
  }
  
  lines.push("");
  lines.push(`Available tools: ${availableTools.join(", ")}`);
  
  return lines.join("\n");
}
```

### 6. Hook for Tool Blocking

Emit hooks when tools are blocked:

```typescript
// packages/core/src/lib/hooks/types.ts
export interface HookEvents {
  // ... existing events
  
  "tool.blocked": {
    tool: string;
    args: unknown;
    status: IssueStatus;
    allowedStatuses: IssueStatus[];
    issueId: string;
  };
}
```

## Tool Status Mappings

### Core Workhorse Tools

| Tool | Status |
|------|--------|
| `workhorse_acknowledge` | `STATUS.ACTIVE` |
| `workhorse_update_status` | `STATUS.ACTIVE` |
| `workhorse_list_tools` | `STATUS.ALL` |
| `workhorse_escalate` | `STATUS.COMMUNICATE` |
| `workhorse_preview_image` | `STATUS.READ_ONLY` |
| `workhorse_plan` | `["planning"]` |

### Pi Adapter Tools (Plan 22)

| Tool | Status |
|------|--------|
| `Read` | `STATUS.READ_ONLY` |
| `Grep` | `STATUS.READ_ONLY` |
| `Glob` | `STATUS.READ_ONLY` |
| `Write` | `STATUS.WRITE` |
| `Edit` | `STATUS.WRITE` |
| `git` | Dynamic — see below |
| `project` | `STATUS.WRITE` |
| `script` | Dynamic — see below |
| `env_info` | `STATUS.READ_ONLY` |
| `file_ops` | `STATUS.WRITE` |

### Dynamic Tool Status Functions

```typescript
// Git tool — status based on action
const gitTool: OrchestratorTool = {
  name: "git",
  status: (args: { action: string }) => {
    const READ_ACTIONS = ["status", "diff", "log"];
    if (READ_ACTIONS.includes(args.action)) {
      return STATUS.READ_ONLY;
    }
    return "implementing";
  },
  // ...
};

// Script tool — status based on action
const scriptTool: OrchestratorTool = {
  name: "script",
  status: (args: { action: string }) => {
    const READ_ACTIONS = ["list", "read"];
    if (READ_ACTIONS.includes(args.action)) {
      return STATUS.READ_ONLY;
    }
    return "implementing";
  },
  // ...
};
```

### Jira Plugin Tools

| Tool | Status |
|------|--------|
| `jira_get_comments` | `STATUS.READ_ONLY` |
| `jira_get_attachments` | `STATUS.READ_ONLY` |
| `jira_add_comment` | `STATUS.COMMUNICATE` |
| `jira_transition_issue` | `STATUS.COMMUNICATE` |

### GitHub Plugin Tools

| Tool | Status |
|------|--------|
| `github_get_pr_status` | `STATUS.READ_ONLY` |
| `github_get_ci_check` | `STATUS.READ_ONLY` |
| `github_get_pr_reviews` | `STATUS.READ_ONLY` |
| `github_add_comment` | `STATUS.COMMUNICATE` |
| `github_open_pr` | `STATUS.WRITE` |

### Playwright Plugin Tools

| Tool | Status |
|------|--------|
| `playwright_screenshot` | `STATUS.READ_ONLY` |
| `playwright_navigate` | `STATUS.WRITE` |
| `playwright_click` | `STATUS.WRITE` |
| `playwright_fill` | `STATUS.WRITE` |

## File Structure

```
packages/core/src/
├── workflow/
│   └── orchestrator/
│       ├── types.ts             # Add status field to OrchestratorTool
│       ├── tool-filter.ts       # NEW: StatusToolFilter class
│       ├── status-sets.ts       # NEW: STATUS constants
│       └── harness.ts           # Wire filter into execution
├── plugins/
│   └── builtin/
│       └── tools/
│           ├── update-status.ts # Update with transition validation
│           ├── list-tools.ts    # NEW: workhorse_list_tools
│           └── plan.ts          # NEW: workhorse_plan
└── lib/
    └── hooks/
        └── types.ts             # Add tool.blocked event
```

## Tasks

### Phase 1: Core Infrastructure
- [ ] Add `ToolStatus` type and `status` field to `OrchestratorTool` interface
- [ ] Create `status-sets.ts` with STATUS constants
- [ ] Implement `StatusToolFilter` class
- [ ] Add `tool.blocked` hook event

### Phase 2: Integration
- [ ] Wire `StatusToolFilter` into tool execution in `harness.ts`
- [ ] Add `workhorse_list_tools` tool (always available)
- [ ] Add `workhorse_plan` tool (planning-only)
- [ ] Update `workhorse_update_status` to return available tools in response
- [ ] Inject plan into prompt when transitioning to `implementing` status
- [ ] Add `getAvailableToolNames(status)` method to `StatusToolFilter`
- [ ] Add status context to system prompt via `prompt.building` hook
- [ ] Update TUI to show available tools for current status

### Phase 3: Tool Updates
- [ ] Update all builtin tools with `status` field
- [ ] Update Pi adapter tools with `status` (static or function)
- [ ] Update Jira plugin tools with `status`
- [ ] Update GitHub plugin tools with `status`
- [ ] Update Playwright plugin tools with `status`

### Phase 4: Testing
- [ ] Unit tests for `StatusToolFilter`
- [ ] Unit tests for status transitions
- [ ] Integration test: planning → implementing → in_review flow
- [ ] Test blocked tool response messages
- [ ] Test dynamic status function resolution

## Open Questions

1. **Auto-transition triggers** — Should certain actions auto-transition? (e.g., first successful edit → implementing)

2. **Multi-agent statuses** — If orchestrator spawns sub-agents, do they inherit parent status or have their own?

## Success Criteria

1. Destructive tools are blocked during planning with helpful messages
2. Explicit transition required before editing
3. Status changes are logged and visible in TUI
4. Status context injected into agent prompts
5. All existing tools have appropriate `status` field
6. Dynamic tools (git, script) correctly resolve status via function
7. Backward compatible — tools without `status` work in all statuses
