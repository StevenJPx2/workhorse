# workhorse-plugin-figma

Figma design file integration for [Workhorse](../../README.md).

Allows agents to work directly from Figma design URLs, read designer comments, post replies, and receive real-time notifications when designs are updated.

## Features

| Capability            | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Issue Parser**      | Accepts Figma file/design/proto URLs (with optional `node-id` anchor)                  |
| **Comment Monitor**   | Polls for new designer comments and pushes them as agent notifications                 |
| **File Monitor**      | Detects when the design file is saved/updated                                          |
| **Prompt Enrichment** | Injects file structure, frames, components & styles into the agent's system prompt     |
| **Tools**             | `figma_get_file`, `figma_get_comments`, `figma_post_comment`                           |
| **Steering Rules**    | Idle-agent reminders to inspect the design, comment after changes, re-fetch on updates |
| **TUI Renderer**      | Renders Figma notifications and tool calls in the Workhorse TUI                        |

## Supported URL Formats

```
https://www.figma.com/file/<key>/<name>
https://www.figma.com/file/<key>/<name>?node-id=<nodeId>
https://www.figma.com/design/<key>/<name>
https://www.figma.com/design/<key>/<name>?node-id=<nodeId>
https://www.figma.com/proto/<key>/<name>
```

## Setup

### 1. Create a Figma Personal Access Token

1. Go to **Figma → Account Settings → Personal Access Tokens**
2. Create a new token with **Files** read access and **Comments** read+write access
3. Copy the token

### 2. Set the Token

Either export it as an environment variable:

```bash
export FIGMA_ACCESS_TOKEN="your-figma-pat"
```

Or add it to your shell profile / CI secrets.

### 3. Register the Plugin

```typescript
import { figmaPlugin } from "workhorse-plugin-figma";

const jt = await bootstrap({
  plugins: [figmaPlugin],
});
```

### 4. Configure (Optional)

In `.workhorse.toml`:

```toml
[plugins.figma]
# How often to poll for new comments (ms). Default: 60000
comment_poll_interval = 30000

# How often to poll for file version changes (ms). Default: 120000
file_poll_interval = 60000
```

## Usage

Pass a Figma URL when creating a Workhorse issue:

```bash
wh add "https://www.figma.com/design/abc123XYZ/My-App?node-id=1-23"
```

The agent will automatically:

1. Parse the URL and create an issue from the Figma file/frame metadata
2. Inject the file's pages, frames, components, and styles into its system prompt
3. Start polling for new comments and file changes
4. Receive steering rule reminders to inspect the design and comment on progress

## Agent Tools

### `figma_get_file`

Fetch the full file structure at any point during implementation.

```
figma_get_file({ depth: 2 })
```

Returns pages, top-level frames, components, and design tokens.

### `figma_get_comments`

Read all designer comments and feedback threads.

```
figma_get_comments({ includeResolved: false })
```

### `figma_post_comment`

Post a comment (or reply) on the Figma file.

```
figma_post_comment({
  message: "Starting implementation. Quick question: should the hover state use opacity 0.8 or the accent color token?",
  replyToId: "1234"  // optional — to reply in an existing thread
})
```

## Steering Rules

| Rule                                     | Trigger                                            | Reminder                           |
| ---------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| `figma:check-design-before-implementing` | Status `implementing`, no `figma_get_file` yet     | Inspect the Figma file first       |
| `figma:comment-after-implementation`     | Code edits with no subsequent `figma_post_comment` | Let the designer know progress     |
| `figma:design-updated-check`             | File-update notification, no re-fetch since then   | Design changed — re-fetch          |
| `figma:address-feedback`                 | Unacknowledged Figma notifications                 | Read and address designer feedback |

## Architecture

```
src/
├── index.ts          Plugin entry point (definePlugin)
├── types.ts          Figma API TypeScript types
├── client.ts         Figma REST API client (PAT auth)
├── credentials.ts    PAT credential getter
├── parser.ts         URL parser → ParsedIssue
├── monitor.ts        Comment + file-version monitors
├── prompt.ts         prompt.building hook (context injection)
├── renderer.ts       TUI renderer for notifications & tools
├── steering.ts       Idle-agent steering rules
└── tools/
    ├── index.ts
    ├── get-file.ts
    ├── get-comments.ts
    ├── post-comment.ts
    └── types.ts
```
