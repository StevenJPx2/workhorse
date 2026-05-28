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
| `planning` | Understanding requirements, exploring codebase | Read, Grep, Glob |
| `implementing` | Writing code, making changes | All tools |
| `blocked` | Waiting for human input | Read, communicate |
| `in_review` | PR submitted, addressing feedback | All tools |
| `done` | Work finished | Read-only |

> **Note:** `queued` status is being removed - `pending` covers the "not started" case.

### Tool `status` Parameter

Each tool declares which statuses it's available in via a `status` field:

```typescript
interface OrchestratorTool {
  name: string;
  description: string;
  schema: JsonSchema;
  
  // Statuses where this tool is available
  // If omitted, tool is available in ALL statuses (backward compatible)
  status?: IssueStatus[];
  
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<Result>;
}
```

**Benefits:**
- Simple — single optional field
- No dynamic functions needed (YAGNI - we don't have tools with mixed read/write actions)
- No category abstraction layer
- Easy to understand at a glance
- Backward compatible - omit field for "always available"

### Tool Definitions with Status

```typescript
// Destructive tools — only during write phases
orchestrator.registerTool({
  name: "Write",
  status: ["implementing", "in_review"],
  // ...
});

orchestrator.registerTool({
  name: "Edit", 
  status: ["implementing", "in_review"],
  // ...
});

orchestrator.registerTool({
  name: "Bash",
  status: ["implementing", "in_review"],
  // ...
});

// Everything else — no status field needed
orchestrator.registerTool({
  name: "Read",
  // no status field = always available
  // ...
});

orchestrator.registerTool({
  name: "workhorse_escalate",
  // no status field = always available
  // ...
});
```

### Simplified Approach

The only restriction we need is blocking destructive actions during planning. Everything else is available everywhere.

```typescript
// Destructive tools — only during implementing
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

// Everything else — no status field, available everywhere
orchestrator.registerTool({
  name: "Read",
  // no status field = always available
  // ...
});

orchestrator.registerTool({
  name: "workhorse_escalate",
  // no status field = always available
  // ...
});
```

**Key insight:** We don't need constants like `STATUS.READ_ONLY` or `STATUS.COMMUNICATE` because:
- Read-only tools don't need gating (omit `status` entirely)
- Communication tools should always be available (omit `status` entirely)
- Only destructive tools need `status: ["implementing"]`

## Implementation

### 1. Extend OrchestratorTool Interface (DONE)

Added `status?: IssueStatus[]` field to `OrchestratorTool` in `packages/core/src/workflow/orchestrator/types/tools.ts`.

### 2. Inline Status Check in Harness

Add status check directly in tool execution (no separate class needed):

```typescript
// packages/core/src/workflow/orchestrator/harness.ts
async function executeTool(
  tool: OrchestratorTool,
  args: unknown,
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  const currentStatus = ctx.issue.status;
  
  // Check if tool is blocked by status
  if (tool.status && tool.status.length > 0 && !tool.status.includes(currentStatus)) {
    return {
      success: false,
      error: `Tool "${tool.name}" is not available in "${currentStatus}" status. Available in: ${tool.status.join(", ")}.`,
      hint: "Use workhorse_update_status to transition to 'implementing' or 'in_review'."
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

Only destructive tools need a `status` field. Everything else is available in all statuses by default.

### Destructive Tools (status: `["implementing", "in_review"]`)

| Tool | Plugin |
|------|--------|
| `Write` | Pi Adapter |
| `Edit` | Pi Adapter |
| `Bash` | Pi Adapter |
| `file_ops` | Pi Adapter |
| `project` | Pi Adapter |
| `github_open_pr` | GitHub |

### No Status Required (always available)

All other tools omit the `status` field entirely:
- Core: `workhorse_acknowledge`, `workhorse_update_status`, `workhorse_list_tools`, `workhorse_escalate`, `workhorse_preview_image`, `workhorse_plan`
- Pi Adapter: `Read`, `Grep`, `Glob`, `env_info`
- Jira: `jira_get_comments`, `jira_get_attachments`, `jira_add_comment`, `jira_transition_issue`
- GitHub: `github_get_pr_status`, `github_get_ci_check`, `github_get_pr_reviews`, `github_add_comment`
- Playwright: `playwright_navigate`, `playwright_click`, `playwright_fill`, `playwright_screenshot` (browser interaction, not filesystem)

## File Structure

```
packages/core/src/
├── workflow/
│   └── orchestrator/
│       ├── types.ts             # Add status field to OrchestratorTool (DONE)
│       └── harness.ts           # Add inline status check in tool execution
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

### Phase 0: Cleanup ✅
- [x] Remove `queued` status from schema (`packages/core/src/db/schema/issues.ts`)
- [x] Create `STATUSES` constant array as single source of truth
- [x] Update `update-status` tool definition to use `STATUSES`
- [x] Update `update-status` tool implementation to use `STATUSES`
- [x] Remove `queued` from Jira sync mapping
- [x] Remove `queued` from TUI status component
- [x] Update `status-utils.ts` in TUI (remove queued from config)
- [x] Refactor `workhorse-status.tsx` to use `status-utils.ts` (remove duplication)
- [x] Update tests that reference `queued`
- [x] Update READMEs referencing `queued`
- [x] Fix steering.ts invalid `debugging` status references

### Phase 1: Core Infrastructure ✅
- [x] Add `status?: IssueStatus[]` field to `OrchestratorTool` interface
- [x] Add status check in `AgentAdapter.tools` getter (filters by issue status)
- [x] Add `workhorse_list_tools` tool (shows available/blocked tools per status)

### Phase 2: Tool Updates ✅
- [x] Add `status: ["implementing", "in_review"]` to `github_open_pr` tool
- [x] Add `status: ["implementing", "in_review"]` to `github_add_comment` tool
- [x] Add `status: ["implementing", "in_review"]` to `jira_add_comment` tool
- [x] Add `status: ["implementing", "in_review"]` to `jira_transition_issue` tool

### Phase 3: Pi SDK Tool Gating ✅
- [x] Add `WRITE_STATUSES` constant to core schema (`["implementing", "in_review"]`)
- [x] Export `WRITE_STATUSES` from `workhorse-core`
- [x] Update `PiAgentAdapter.buildCustomTools()` to conditionally include Write/Edit/Bash based on issue status
- [x] When status is NOT in `WRITE_STATUSES`, only `createReadTool` is passed to Pi session
- [x] When status IS in `WRITE_STATUSES`, all tools (Read, Write, Edit, Bash) are available

### Phase 4: Future Enhancements (Optional)
- [ ] Add `tool.blocked` hook event for observability
- [ ] Add `workhorse_plan` tool (planning-only)  
- [ ] Add status context to system prompt via `prompt.building` hook
- [ ] Unit tests for status filtering
- [ ] Integration test: planning → implementing → in_review flow

## Open Questions

1. **Pi SDK tool filtering** — To filter Write/Edit/Bash by status, we'd need to either:
   - Modify Pi adapter to conditionally register `customTools` based on issue status
   - Wrap Pi tools with status check before execution
   - Request Pi SDK feature for tool filtering

2. **Auto-transition triggers** — Should certain actions auto-transition? (e.g., first successful edit → implementing)

3. **Multi-agent statuses** — If orchestrator spawns sub-agents, do they inherit parent status or have their own?

## Success Criteria

1. ✅ Orchestrator tools (github_open_pr, jira_add_comment, etc.) blocked during planning
2. ✅ Explicit transition to `implementing` required before using destructive orchestrator tools
3. ✅ `workhorse_list_tools` shows available and blocked tools per status
4. ✅ Backward compatible — tools without `status` work in all statuses
5. ✅ `queued` status removed from codebase
6. ✅ Pi SDK tools (Write, Edit, Bash) gated via `PiAgentAdapter.buildCustomTools()` — only Read tool available when not in write-enabled status
