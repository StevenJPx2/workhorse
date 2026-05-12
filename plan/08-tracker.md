# Step 8: Tracker

Entry point of the system. Takes raw user input → parser → Issue → prompt. Source-agnostic.

Location: `packages/core/src/workflow/tracker/`

## Domain Types (colocated)

```typescript
interface ParsedIssue {
  externalId: string
  source: IssueSource
  title: string
  description: string
  issueType: IssueType
  url?: string
  assignee?: string
  labels?: string[]
  metadata: Record<string, unknown>
}

interface IssueParser {
  source: IssueSource
  canParse(input: string): boolean
  parse(input: string): Promise<ParsedIssue>
}

interface PromptContextBlock {
  id: string              // "jira-context", "pr-state"
  title: string           // section heading
  content: string         // markdown
  priority?: number       // lower = earlier, default 0
  metadata?: Record<string, unknown>
}

interface PromptContext {
  issue: Issue
  sessionMemory?: SessionMemory
  searchResults?: SearchResult[]
  isResume: boolean
  contextBlocks: PromptContextBlock[]
  customInstructions?: string
}
```

## Tracker Class

```typescript
class Tracker {
  private parsers: IssueParser[] = []

  constructor(db: Database, memory: MemoryService, hooks: Hooks, config: Readonly<JiratownConfig>)

  registerParser(parser: IssueParser): void
  async parseInput(input: string): Promise<Issue>
  async buildPrompt(issueId: string, options?: { isResume?: boolean }): Promise<string>
}
```

### Parse Flow

```
"AM-123" → try each parser.canParse() → first match calls parse() → insert DB → emit "issue.parsed" → return Issue
```

## PromptEngineer Class

```typescript
class PromptEngineer {
  constructor(config: Readonly<JiratownConfig>)

  buildPrompt(ctx: PromptContext): string
  buildSystemPrompt(ctx: PromptContext): string
  buildInitialPrompt(ctx: PromptContext): string
  buildResumePrompt(ctx: PromptContext): string
}
```

### Prompt Assembly

1. Emit `prompt.building` → plugins push `PromptContextBlock`s onto `ctx.contextBlocks`
2. Sort blocks by priority
3. New issue → `buildSystemPrompt()` + `buildInitialPrompt()`; resume → `buildSystemPrompt()` + `buildResumePrompt()`
4. Render context blocks as `## {title}\n{content}` sections
5. Append custom instructions from config
6. Emit `prompt.built`

### Memory + Notification Enrichment

Before building, query MemoryService:
- L1: `readSessionMemory(worktreePath)` → sets `isResume` + `sessionMemory`
- L2: `search(issue title + description)` → `searchResults`
- Pending notifications: `getUnreadNotifications(issueId)` → bundled as `<system_inbox>` XML in the prompt so the agent starts with full context. No polling needed.

## Tests

- Parser: registers, resolves correct parser, throws if none match, emits `issue.parsed`
- Prompt: builds initial/resume, includes custom instructions, emits `prompt.building`/`prompt.built`, enriches from MemoryService