# workhorse-plugin-playwright

Browser automation plugin for Workhorse using Playwright. Provides headless browser control for testing, screenshot capture, and web interaction during issue implementation.

## Installation

```bash
bun add workhorse-plugin-playwright
```

## Prerequisites

- **Playwright** must be installed with at least one browser: `npx playwright install chromium`
- Node.js 18+ (Playwright requirement)

## Features

| Feature | Description |
|---------|-------------|
| **Session Management** | One browser session per issue, auto-cleanup on agent stop |
| **Navigation** | Load URLs, wait for network idle, track page state |
| **Screenshots** | Full page or element capture, PNG/JPEG support |
| **DOM Interaction** | Click, fill forms, query elements by selector |
| **JavaScript Evaluation** | Execute arbitrary JS in page context |
| **Cross-Plugin Sync** | Auto-adds Screenshots section to GitHub PRs |
| **Steering** | Idle agent reminders to capture screenshots before PR |
| **Prompt Enrichment** | Browser testing workflow guidance in agent prompts |

## Configuration

```toml
# ~/.workhorse.toml or .workhorse.toml

[plugins.playwright]
browser_type = "chromium"    # Browser engine: chromium, firefox, webkit (default: chromium)
viewport_width = 1280        # Default viewport width (default: 1280)
viewport_height = 720        # Default viewport height (default: 720)
timeout = 30000              # Navigation timeout in ms (default: 30000)
headless = true              # Run in headless mode (default: true)
```

## Usage

### Register the Plugin

```typescript
import { playwrightPlugin } from "workhorse-plugin-playwright";

const wh = await bootstrap({
  plugins: [playwrightPlugin],
});
```

### Tools

#### playwright_navigate

Navigate to a URL and wait for the page to load:

```typescript
{
  url: "https://example.com/dashboard",
  issueId: "issue-uuid",
  waitUntil: "networkidle"  // Optional: load, domcontentloaded, networkidle
}
```

Returns page title and final URL after any redirects.

#### playwright_screenshot

Capture a screenshot of the current page or a specific element:

```typescript
{
  issueId: "issue-uuid",
  fullPage: true,           // Capture full scrollable page
  selector: "#main-content", // Optional: capture specific element
  format: "png"             // png or jpeg
}
```

Returns the screenshot file path (saved in worktree directory).

#### playwright_click

Click an element on the page:

```typescript
{
  issueId: "issue-uuid",
  selector: "button[type=submit]",
  button: "left"           // Optional: left, right, middle
}
```

#### playwright_fill

Fill a form input with text:

```typescript
{
  issueId: "issue-uuid",
  selector: "input[name=email]",
  value: "test@example.com"
}
```

#### playwright_get_element

Query an element and get its properties:

```typescript
{
  issueId: "issue-uuid",
  selector: ".error-message"
}

// Returns:
// {
//   exists: true,
//   tagName: "div",
//   textContent: "Invalid email address",
//   attributes: { class: "error-message", role: "alert" },
//   isVisible: true
// }
```

#### playwright_get_page_content

Get the current page's content and state:

```typescript
{
  issueId: "issue-uuid",
  includeHtml: false       // Optional: include full HTML
}

// Returns:
// {
//   url: "https://example.com/dashboard",
//   title: "Dashboard | Example",
//   consoleErrors: [...],
//   networkErrors: [...]
// }
```

#### playwright_evaluate

Execute JavaScript in the page context:

```typescript
{
  issueId: "issue-uuid",
  script: "return document.querySelectorAll('.item').length"
}

// Returns the evaluated result (must be JSON-serializable)
```

#### playwright_close_session

Manually close a browser session:

```typescript
{
  issueId: "issue-uuid"
}
```

Note: Sessions are automatically closed when agents stop.

### Session Lifecycle

1. **First tool call** — Browser session created automatically
2. **Subsequent calls** — Reuse existing session for the issue
3. **Agent stop** — Session automatically cleaned up via `agent.stop.post` hook
4. **Manual close** — Use `playwright_close_session` for early cleanup

### Cross-Plugin Sync

When both Playwright and GitHub plugins are loaded:

- **Screenshots in PRs** — When `github_open_pr` is called, Playwright contributes a "Screenshots" section listing any `screenshot-*.png` files in the worktree

Example PR body:
```markdown
## Summary
Added dashboard feature

## Screenshots
![screenshot-1.png](./screenshot-1.png)

![screenshot-2.png](./screenshot-2.png)
```

### Steering Rules

The plugin registers a steering rule that fires when an agent is implementing and has used Playwright tools:

- **Screenshot Reminder** — Reminds agents to capture final screenshots before creating a PR

### Prompt Enrichment

The plugin adds workflow guidance to agent prompts via `prompt.building`:

- **Browser Testing Workflow** — Step-by-step guidance for using Playwright tools effectively

## Types

### BrowserSession

```typescript
interface BrowserSession {
  id: string;
  issueId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  browserType: BrowserType;
  viewport: Viewport;
  createdAt: Date;
}
```

### BrowserType

```typescript
type BrowserType = "chromium" | "firefox" | "webkit";
```

### Viewport

```typescript
interface Viewport {
  width: number;
  height: number;
}
```

### ScreenshotOptions

```typescript
interface ScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  format?: "png" | "jpeg";
  quality?: number;        // For JPEG only
}
```

### PageInfo

```typescript
interface PageInfo {
  url: string;
  title: string;
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
}
```

### ElementInfo

```typescript
interface ElementInfo {
  exists: boolean;
  tagName?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  isVisible?: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

## Hooks

The plugin emits these hooks for cross-plugin coordination:

| Hook | Payload | When |
|------|---------|------|
| `playwright:session.started` | `{ issueId, sessionId, browserType }` | Browser session created |
| `playwright:session.closed` | `{ issueId, sessionId }` | Browser session closed |
| `playwright:page.loading` | `PageLoadingContext` | **Before** page navigation (inject init scripts) |
| `playwright:page.navigated` | `{ issueId, sessionId, url, title }` | Page navigation completed |
| `playwright:screenshot.taken` | `{ issueId, sessionId, path, options }` | Screenshot captured |
| `playwright:console.error` | `{ issueId, sessionId, messages }` | Page console has errors |
| `playwright:network.failed` | `{ issueId, sessionId, url, error }` | Network request failed |
| `playwright:viewport.changed` | `{ issueId, sessionId, viewport }` | Viewport size changed |

### Injecting Init Scripts (page.loading hook)

The `playwright:page.loading` hook fires **before** a page navigates, allowing plugins to inject JavaScript that runs before any page scripts. This is useful for:

- Mocking APIs or browser globals
- Setting up test fixtures
- Intercepting network requests
- Overriding `Date.now()` or other functions

```typescript
import type { PageLoadingContext } from "workhorse-plugin-playwright";

ctx.hooks.on("playwright:page.loading", (event: unknown) => {
  const loadingCtx = event as PageLoadingContext;
  
  // Inject a script that runs before the page loads
  loadingCtx.initScripts.push(`
    // Mock the fetch API
    window.__originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      console.log('Intercepted fetch:', url);
      return window.__originalFetch(url, options);
    };
    
    // Set a test flag
    window.__TEST_MODE__ = true;
  `);
});
```

**PageLoadingContext type:**

```typescript
interface PageLoadingContext {
  issueId: string;
  sessionId: string;
  url: string;
  browserType: BrowserType;
  initScripts: string[];  // Push scripts here to inject them
}
```

Scripts are injected via Playwright's `page.addInitScript()` API, which runs the script in the page context before any other scripts execute.

### Listening to Other Hooks

```typescript
ctx.hooks.on("playwright:page.navigated", (event: unknown) => {
  const { issueId, url, title } = event as {
    issueId: string;
    url: string;
    title: string;
  };
  console.log(`Page navigated: ${title} (${url})`);
});
```

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Plugin definition and setup |
| `session-manager.ts` | Browser session lifecycle management |
| `browser-operations.ts` | Core Playwright operations (navigate, screenshot, etc.) |
| `tools/` | Tool implementations for each browser action |
| `cross-plugin-sync.ts` | GitHub PR screenshot contribution |
| `steering.ts` | Screenshot reminder steering rule |
| `prompt.ts` | Browser testing workflow prompt enrichment |
| `renderer.ts` | TUI activity renderer for Playwright tools |
| `hooks.ts` | Plugin hook type definitions |
| `types.ts` | Domain types (BrowserSession, Viewport, etc.) |

## Advanced Usage

### Custom Session Management

```typescript
import { PlaywrightSessionManager } from "workhorse-plugin-playwright";

// Access the session manager for advanced operations
const session = await sessionManager.getOrCreateSession(issueId, {
  headless: false,  // Debug with visible browser
});

// Direct Playwright access
await session.page.evaluate(() => {
  // Custom page operations
});
```

## License

MIT
