# Step 18: Plugin Skills

Plugins can provide skill instructions that are injected into agent system prompts. Skills are global (always active when the plugin is loaded) and declared in the plugin manifest.

Location: `packages/core/src/workflow/orchestrator/` (skill registration) + `packages/plugins/*/skills/` (skill files)

## Design Decisions

| Decision             | Choice          | Rationale                                                       |
| -------------------- | --------------- | --------------------------------------------------------------- |
| Skill scope          | Global only     | All registered skills always included in prompt                 |
| File location        | Plugin-relative | Each plugin has its own `skills/` directory                     |
| TUI visibility       | None            | Skills are internal, not exposed to users                       |
| Manifest declaration | Required        | Declare in `manifest.capabilities.skills[]` for discoverability |

## Skill Interface

```typescript
// packages/core/src/workflow/orchestrator/types/skills.ts

interface PluginSkill {
  /** Unique identifier: "pluginName:skillName" (e.g., "github:pr-workflow") */
  id: string;

  /** Human-readable name for logging/debugging */
  name: string;

  /** Short description of what this skill teaches */
  description: string;

  /** Skill content - exactly one required */
  instructions?: string; // Inline markdown
  instructionsPath?: string; // Relative path to .md file in plugin package

  /** Ordering in prompt (lower = earlier, default: 50) */
  priority?: number;
}

const PluginSkillSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    instructions: z.string().optional(),
    instructionsPath: z.string().optional(),
    priority: z.number().int().min(0).max(100).default(50),
  })
  .refine(
    (s) => Boolean(s.instructions) !== Boolean(s.instructionsPath),
    "Exactly one of 'instructions' or 'instructionsPath' must be provided",
  );
```

## Manifest Declaration

Skills must be declared in the plugin manifest for discoverability:

```typescript
// packages/plugins/github/src/index.ts
export const githubPlugin = definePlugin({
  manifest: {
    name: "github",
    version: "1.0.0",
    capabilities: {
      parsers: ["github"],
      monitors: ["github-pr"],
      tools: ["github_open_pr", "github_add_comment"],
      skills: ["github:pr-workflow", "github:code-review"], // NEW
    },
  },
  setup(ctx, config) {
    // Register skills
    ctx.orchestrator.registerSkill({
      id: "github:pr-workflow",
      name: "GitHub PR Workflow",
      description: "Instructions for creating and managing pull requests",
      instructionsPath: "skills/pr-workflow.md",
      priority: 20,
    });

    ctx.orchestrator.registerSkill({
      id: "github:code-review",
      name: "Code Review Response",
      description: "How to respond to PR review comments",
      instructionsPath: "skills/code-review.md",
      priority: 25,
    });
  },
});
```

## Skill File Structure

Each plugin with skills has a `skills/` directory:

```
packages/plugins/github/
├── src/
│   └── index.ts
├── skills/
│   ├── pr-workflow.md
│   └── code-review.md
└── package.json

packages/plugins/jira/
├── src/
│   └── index.ts
├── skills/
│   └── ticket-workflow.md
└── package.json
```

Skill files are plain markdown with the instructions:

```markdown
<!-- skills/pr-workflow.md -->

## Pull Request Workflow

When your implementation is complete and tests pass:

1. Use `github_open_pr` to create a pull request
2. Write a clear title summarizing the change
3. Include a description with:
   - What changed and why
   - Testing performed
   - Any breaking changes

After creating the PR:

- Monitor CI checks and address failures promptly
- Respond to review comments within the same session if possible
- Use `github_add_comment` to reply to reviewers
```

## Registration Flow

### 1. Plugin Setup

When a plugin calls `ctx.orchestrator.registerSkill()`:

```typescript
// packages/core/src/workflow/orchestrator/orchestrator.ts

class HarnessOrchestrator {
  private skills = new Map<string, ResolvedSkill>();

  registerSkill(skill: PluginSkill): void {
    // Validate schema
    const validated = PluginSkillSchema.parse(skill);

    // Resolve instructions if path provided
    const resolved: ResolvedSkill = {
      ...validated,
      instructions:
        validated.instructions ??
        this.loadSkillFile(validated.instructionsPath!),
    };

    // Check for duplicates
    if (this.skills.has(resolved.id)) {
      throw new Error(`Skill "${resolved.id}" already registered`);
    }

    this.skills.set(resolved.id, resolved);
    this.hooks.emit("skill.registered", { skill: resolved });
  }

  getSkills(): ResolvedSkill[] {
    return [...this.skills.values()].sort((a, b) => a.priority - b.priority);
  }

  private loadSkillFile(relativePath: string): string {
    // Path is relative to the plugin package that's currently being set up
    // This requires tracking the "current plugin" during setup
    const fullPath = resolve(this.currentPluginPath, relativePath);
    return readFileSync(fullPath, "utf-8");
  }
}
```

### 2. Prompt Building

PromptEngineer queries skills and renders them as context blocks:

```typescript
// packages/core/src/workflow/tracker/engineer.ts

async buildSystemPrompt(issue: Issue): Promise<string> {
  const blocks: ContextBlock[] = [];

  // ... existing blocks (issue state, pending notifications, etc.)

  // Add skill blocks
  const skills = this.orchestrator.getSkills();
  for (const skill of skills) {
    blocks.push({
      id: `skill:${skill.id}`,
      priority: skill.priority,
      title: skill.name,
      content: skill.instructions,
    });
  }

  // Sort by priority and render
  return this.renderBlocks(blocks.sort((a, b) => a.priority - b.priority));
}
```

## Types to Add

```typescript
// packages/core/src/workflow/orchestrator/types/skills.ts

export interface PluginSkill {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  instructionsPath?: string;
  priority?: number;
}

export interface ResolvedSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;  // Always resolved
  priority: number;      // Always has default
}

// packages/core/src/lib/hooks/types.ts (add to existing)
"skill.registered": { skill: ResolvedSkill };
```

## Manifest Schema Update

```typescript
// packages/core/src/plugins/types.ts

const PluginManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  capabilities: z
    .object({
      parsers: z.array(z.string()).optional(),
      monitors: z.array(z.string()).optional(),
      tools: z.array(z.string()).optional(),
      adapters: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(), // NEW
    })
    .optional(),
});
```

## Implementation Files

| File                                                      | Change                                              |
| --------------------------------------------------------- | --------------------------------------------------- |
| `packages/core/src/workflow/orchestrator/types/skills.ts` | NEW: `PluginSkill`, `ResolvedSkill`, schema         |
| `packages/core/src/workflow/orchestrator/types/index.ts`  | Export skill types                                  |
| `packages/core/src/workflow/orchestrator/orchestrator.ts` | Add `registerSkill()`, `getSkills()`, skill storage |
| `packages/core/src/workflow/tracker/engineer.ts`          | Render skills into system prompt                    |
| `packages/core/src/plugins/types.ts`                      | Add `skills` to manifest capabilities               |
| `packages/core/src/lib/hooks/types.ts`                    | Add `skill.registered` hook                         |
| `packages/plugins/github/skills/`                         | NEW: GitHub skill files                             |
| `packages/plugins/jira/skills/`                           | NEW: Jira skill files                               |
| `packages/plugins/playwright/skills/`                     | NEW: Playwright skill files                         |

## Tests

### Unit Tests

- **Skill registration**: validates schema, rejects duplicates, resolves file paths
- **Skill loading**: reads markdown files, handles missing files gracefully
- **Skill ordering**: returns skills sorted by priority
- **Manifest validation**: accepts valid skills array, rejects invalid

### Integration Tests

- **Prompt building**: skills appear in system prompt in correct order
- **Plugin setup**: skills registered during plugin initialization
- **Multiple plugins**: skills from different plugins coexist

## Example Skills

### GitHub Plugin

**`skills/pr-workflow.md`** (priority: 20)

- When to create PRs
- How to write good PR descriptions
- Handling CI failures
- Responding to reviews

**`skills/code-review.md`** (priority: 25)

- How to interpret review comments
- When to push fixes vs discuss
- Marking conversations resolved

### Jira Plugin

**`skills/ticket-workflow.md`** (priority: 30)

- Understanding Jira statuses
- When to transition tickets
- Adding useful comments
- Handling blocked tickets

### Playwright Plugin

**`skills/browser-testing.md`** (priority: 40)

- When to use browser automation
- Writing reliable selectors
- Handling dynamic content
- Screenshot best practices

## Migration Notes

Currently, "skill-like" behavior exists in:

- `prompt.building` hook handlers that inject context blocks
- Steering rules that remind idle agents

These can coexist with the new skills system:

- **Prompt hooks**: For dynamic, runtime-computed context (e.g., current PR status)
- **Skills**: For static instructions that don't change per-issue
- **Steering rules**: For idle-triggered reminders (orthogonal to skills)

## Open Questions (Resolved)

| Question             | Decision                                        |
| -------------------- | ----------------------------------------------- |
| Per-issue vs global? | Global only — simpler, all skills always active |
| File location?       | Plugin-relative — each plugin owns its skills   |
| TUI visibility?      | None — internal implementation detail           |
| Manifest required?   | Yes — discoverability and validation            |
