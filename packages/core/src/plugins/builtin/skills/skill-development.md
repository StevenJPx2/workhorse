# Skill Development Guide

This skill teaches you how to create Workhorse skills — markdown instructions that agents can load on-demand.

## What Are Skills?

Skills are specialized instructions that provide guidance for particular tasks. Instead of polluting every prompt with all instructions upfront, skills are loaded on-demand when needed via the `load_skill` tool.

## Skill Levels

Skills can be created at four levels (in precedence order):

### 1. Plugin Skills (highest precedence)

Registered programmatically by plugins:

```typescript
// In plugin setup
orchestrator.skillRegistry.registerSkill({
  id: "myplugin:code-review",
  name: "Code Review Guidelines",
  description: "Best practices for reviewing code",
  instructions: "## Code Review\n\n1. Check error handling...",
  priority: 40,
});
```

Or from an external file:

```typescript
orchestrator.skillRegistry.registerSkill({
  id: "myplugin:deployment",
  name: "Deployment Process",
  description: "How to deploy to production",
  instructionsPath: "./skills/deployment.md", // Relative to plugin dir
  priority: 30,
});
```

### 2. Global Skills (`~/.workhorse/skills/`)

Available across all projects for the user:

```
~/.workhorse/skills/
├── coding-standards.md
├── git-workflow.md
└── testing-guidelines.md
```

ID format: `global:filename` (e.g., `global:coding-standards`)

### 3. Local Skills (`.workhorse/skills/`)

Project-specific skills:

```
.workhorse/skills/
├── api-conventions.md
├── database-patterns.md
└── error-handling.md
```

ID format: `local:filename` (e.g., `local:api-conventions`)

### 4. Claude Skills (`.claude/skills/`)

Compatible with standard Claude agent format:

```
.claude/skills/
├── deployment.md
└── security-review.md
```

ID format: `claude:filename` (e.g., `claude:deployment`)

## Skill File Format

Skills are markdown files with optional YAML frontmatter:

```markdown
---
name: PR Workflow
description: How to create and manage pull requests
priority: 40
---

## Creating Pull Requests

1. Create a feature branch from main
2. Make your changes with clear commits
3. Push and open a PR

## Review Process

- Request reviews from relevant team members
- Address feedback promptly
- Squash commits before merging
```

### Frontmatter Fields

| Field         | Required | Default                | Description                         |
| ------------- | -------- | ---------------------- | ----------------------------------- |
| `name`        | No       | Filename (title-cased) | Display name                        |
| `description` | No       | "Local skill: {name}"  | Brief description shown in prompt   |
| `priority`    | No       | 50                     | Sort order (0-100, lower = earlier) |

## Creating a Skill File

### Step 1: Choose Location

- **Global** (`~/.workhorse/skills/`): For personal workflows used across projects
- **Local** (`.workhorse/skills/`): For project-specific guidance
- **Claude** (`.claude/skills/`): For compatibility with other Claude-based agents

### Step 2: Create the File

```bash
# Create local skill
mkdir -p .workhorse/skills
touch .workhorse/skills/my-workflow.md
```

### Step 3: Write Instructions

```markdown
---
name: My Workflow
description: Guidelines for my specific workflow
priority: 45
---

## Overview

This skill provides guidance for...

## Steps

1. First, do this
2. Then, do that
3. Finally, verify the result

## Common Issues

### Issue 1

Solution for issue 1...

### Issue 2

Solution for issue 2...
```

## Best Practices

### Keep Skills Focused

Each skill should cover one specific workflow or topic:

✅ Good: "PR Review Checklist", "Database Migration", "API Error Handling"
❌ Bad: "Everything About Development" (too broad)

### Write Clear Instructions

- Use numbered steps for procedures
- Include code examples where helpful
- Cover common edge cases and errors
- Keep instructions actionable

### Use Appropriate Priority

| Priority Range | Use Case                        |
| -------------- | ------------------------------- |
| 0-20           | Critical project-specific rules |
| 20-40          | Important workflows             |
| 40-60          | Standard procedures (default)   |
| 60-80          | Reference information           |
| 80-100         | Nice-to-have context            |

### Organize by Topic

```
.workhorse/skills/
├── workflows/
│   ├── pr-workflow.md
│   └── release-workflow.md
├── standards/
│   ├── code-style.md
│   └── testing.md
└── guides/
    ├── debugging.md
    └── performance.md
```

Note: Subdirectories are not currently auto-discovered. Place files directly in the skills directory.

## Plugin Skill Registration

For plugin authors, register skills programmatically:

```typescript
// Inline instructions
orchestrator.skillRegistry.registerSkill({
  id: "myplugin:quick-guide",
  name: "Quick Guide",
  description: "Quick start instructions",
  instructions: `
## Quick Start

1. Install dependencies
2. Configure settings
3. Run the application
`,
  priority: 50,
});

// From file (relative to plugin directory)
orchestrator.skillRegistry.registerSkill({
  id: "myplugin:detailed-guide",
  name: "Detailed Guide",
  description: "Comprehensive documentation",
  instructionsPath: "./skills/detailed-guide.md",
  priority: 60,
});
```

### Schema Requirements

| Field              | Required | Type   | Description                                                       |
| ------------------ | -------- | ------ | ----------------------------------------------------------------- |
| `id`               | ✅       | string | Format: `pluginname:skillname` (lowercase, alphanumeric, hyphens) |
| `name`             | ✅       | string | Human-readable name (1-100 chars)                                 |
| `description`      | ✅       | string | Brief description (1-500 chars)                                   |
| `instructions`     | ✅\*     | string | Inline markdown content                                           |
| `instructionsPath` | ✅\*     | string | Relative path to .md file                                         |
| `priority`         | ❌       | number | 0-100, default: 50                                                |

\*Exactly one of `instructions` or `instructionsPath` must be provided.

## Using Skills

Skills are listed in the agent's prompt under "Available Skills". To load a skill's full instructions:

```
Use the load_skill tool with the skill ID:
- load_skill({ skillId: "local:pr-workflow" })
- load_skill({ skillId: "global:coding-standards" })
- load_skill({ skillId: "myplugin:deployment" })
```

## Discovery Order

Skills are discovered in this order (earlier takes precedence for same base name):

1. `~/.workhorse/skills/` → `global:` prefix
2. `.workhorse/skills/` → `local:` prefix
3. `.claude/skills/` → `claude:` prefix

Plugin-registered skills always take precedence over discovered skills with the same ID.
