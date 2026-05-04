# Tracker

Entry point for parsing user input into issues and building prompts. Source-agnostic.

## Overview

The Tracker module provides:
- **Issue parsing**: Convert user input (e.g., "AM-123") into database issues
- **Prompt building**: Assemble prompts with memory enrichment and plugin context

## Architecture

```
User Input → Parser → Issue → PromptEngineer → Prompt
     ↓           ↓               ↓
  "AM-123"   ParsedIssue    Memory + Config → String
```

## Components

### Tracker

Main entry point. Manages parsers and orchestrates prompt building.

```typescript
import { Tracker } from "#workflow/tracker";

const tracker = new Tracker(db, hooks, memory, config);

// Register a parser (plugins do this in setup())
tracker.registerParser({
  source: "jira",
  canParse: (input) => /^[A-Z]+-\d+$/.test(input),
  parse: async (input) => fetchJiraIssue(input),
});

// Parse user input
const issue = await tracker.parseInput("AM-123");

// Build prompt for issue
const prompt = await tracker.buildPrompt(issue.id);
```

### IssueParser

Class for converting user input to issues and building prompts. Contains `PromptEngineer` internally.

```typescript
import { IssueParser } from "#workflow/tracker";

// Create directly with constructor arguments
const parser = new IssueParser(
  "jira",                                    // source
  (input) => /^[A-Z]+-\d+$/.test(input),    // canParse
  async (input) => fetchJiraIssue(input),   // parse
);

// Or create from options object (memory/config injected by Tracker)
const parser = IssueParser.from(
  {
    source: "jira",
    canParse: (input) => /^[A-Z]+-\d+$/.test(input),
    parse: async (input) => fetchJiraIssue(input),
  },
  memory,
  config,
);
```

### PromptEngineer

Assembles prompts from issues with memory enrichment. Instantiated per-issue.

```typescript
import { PromptEngineer } from "#workflow/tracker";

// Create engineer for a specific issue
const engineer = new PromptEngineer(issue, memory, config.prompt.custom);

// Build prompt (gathers context from memory automatically)
const prompt = await engineer.buildPrompt();

// With options
const prompt = await engineer.buildPrompt({ isResume: true });

// Build hybrid prompt (system + initial message)
const { systemPrompt, initialMessage } = await engineer.buildHybridPrompt({
  tools: orchestratorTools,
});
```

## Parse Flow

1. User provides input (e.g., "AM-123")
2. `Tracker.parseInput()` tries each registered parser's `canParse()`
3. First matching parser calls `parse()` → `ParsedIssue`
4. Check if issue exists in DB (by externalId + source)
5. Insert or return existing issue
6. Emit `issue.parsed` hook

## Prompt Building Flow

1. `Tracker.buildPrompt(issueId)` fetches issue from DB
2. Finds parser matching issue's source
3. Delegates to `IssueParser.buildPrompt()` → `PromptEngineer`
4. `PromptEngineer.gatherContext()`:
   - Query L1 memory (session context from context.md)
   - Query L2 memory (semantic search for relevant context)
   - Fetch pending notifications → add as context block
5. Assemble prompt sections (issue info, context blocks, search results, custom instructions)
6. Build initial or resume prompt based on `isResume`
7. Emit `prompt.built` hook

## Plugin Integration

Plugins can:

### Register Parsers

```typescript
definePlugin({
  setup(ctx) {
    // memory/config are injected by Tracker automatically
    ctx.tracker.registerParser({
      source: "jira",
      canParse: (input) => /^[A-Z]+-\d+$/.test(input),
      parse: async (input) => {
        // Fetch from Jira API
        return { externalId: input, source: "jira", ... };
      },
    });
  },
});
```

### Add Context Blocks

```typescript
definePlugin({
  setup(ctx) {
    ctx.hooks.on("prompt.building", ({ context }) => {
      context.contextBlocks.push({
        id: "my-context",
        title: "Custom Context",
        content: "Additional information...",
        priority: 0,  // Lower = earlier in prompt
      });
    });
  },
});
```

## Types

- `IssueSource` - Issue source identifier ("jira", "github", "manual", ...)
- `IssueType` - Issue type ("task", "bug", "story", "epic", ...)
- `ParsedIssue` - Intermediate form before DB insertion
- `IssueParserOptions` - Options for registering a parser
- `PromptContextBlock` - Block of context for prompts
- `BuildPromptOptions` - Options for `buildPrompt()`

## Memory Integration

- **L1**: Session memory from `context.md` (patterns, sessions)
- **L2**: Semantic search for related context
- **Notifications**: Pending notifications bundled as `<system_inbox>`

## Files

- `types.ts` - Domain types (IssueSource, ParsedIssue, etc.)
- `tracker.ts` - Tracker class
- `parser.ts` - IssueParser class
- `engineer.ts` - PromptEngineer class
- `index.ts` - Barrel exports
