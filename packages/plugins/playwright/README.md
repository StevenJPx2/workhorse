# workhorse-plugin-playwright

Browser automation for Workhorse — enables agents to capture screenshots, verify UI, and test web applications.

## What This Plugin Does

This plugin provides Playwright-powered browser automation, allowing agents to:

- **Navigate and interact** with web pages
- **Capture screenshots** for PR documentation
- **Verify UI changes** during development
- **Debug visual issues** by inspecting page state

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Playwright Plugin                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PlaywrightSessionManager                     │   │
│  │  - One browser session per issue                          │   │
│  │  - Lazy creation, auto-cleanup                            │   │
│  │  - Manages page lifecycle                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                        Tools                             │    │
│  │  navigate │ screenshot │ click │ fill │ get_element     │    │
│  │  get_page_content │ evaluate │ close_session             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Steering Rules                         │    │
│  │  screenshot-before-pr: Remind to capture evidence        │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  Hooks Emitted: session.started/closed, page.*, screenshot.*   │
│  Hooks Listened: agent.stop.post, prompt.building, pr.opening  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │  workhorse-core │
                      └─────────────────┘
```

## What It Registers

### Tools

| Tool                          | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `playwright_navigate`         | Navigate to URL (creates session if needed) |
| `playwright_screenshot`       | Capture screenshot of page or element       |
| `playwright_click`            | Click element by selector                   |
| `playwright_fill`             | Fill form field                             |
| `playwright_get_element`      | Get element info (text, attributes)         |
| `playwright_get_page_content` | Get page HTML or text content               |
| `playwright_evaluate`         | Run JavaScript on page                      |
| `playwright_close_session`    | Close browser session                       |

### Steering Rules

| Rule                              | Condition                            | Reminder                                 |
| --------------------------------- | ------------------------------------ | ---------------------------------------- |
| `playwright:screenshot-before-pr` | Has UI changes, no screenshots taken | "Capture screenshots before creating PR" |

### TUI Renderer: `playwright`

Renders browser activities:

- Navigation → globe icon + URL
- Screenshot → camera icon + filename
- Click/fill → cursor icon + selector
- Console errors → warning icon + message

## Session Management

One browser session per issue, lazily created:

```typescript
class PlaywrightSessionManager {
  private sessions = new Map<string, SessionState>();

  async getOrCreateSession(issueId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(issueId);
    if (existing?.session.isActive) {
      return existing.session;
    }

    // Launch browser
    const browser = await chromium.launch({
      headless: config.headless,
    });

    const page = await browser.newPage({
      viewport: {
        width: config.viewportWidth,
        height: config.viewportHeight,
      },
    });

    const session = new BrowserSession(browser, page);
    this.sessions.set(issueId, { session, createdAt: Date.now() });

    hooks.emit("playwright:session.started", { issueId });
    return session;
  }

  async closeSession(issueId: string): Promise<void> {
    const state = this.sessions.get(issueId);
    if (state) {
      await state.session.close();
      this.sessions.delete(issueId);
      hooks.emit("playwright:session.closed", { issueId });
    }
  }
}
```

**Auto-cleanup on agent stop:**

```typescript
hooks.on("agent.stop.post", async ({ adapter }) => {
  await sessionManager.closeSession(adapter.issue.id);
});
```

## Hooks

### Emitted

| Hook                          | Payload                             | When                               |
| ----------------------------- | ----------------------------------- | ---------------------------------- |
| `playwright:session.started`  | `{ issueId }`                       | Browser launched                   |
| `playwright:session.closed`   | `{ issueId }`                       | Browser closed                     |
| `playwright:page.loading`     | `{ issueId, url, initScripts: [] }` | Before navigation (inject scripts) |
| `playwright:page.navigated`   | `{ issueId, url, title }`           | After navigation                   |
| `playwright:screenshot.taken` | `{ issueId, path, selector? }`      | Screenshot captured                |
| `playwright:console.error`    | `{ issueId, message }`              | Page console error                 |
| `playwright:network.failed`   | `{ issueId, url, error }`           | Network request failed             |
| `playwright:viewport.changed` | `{ issueId, width, height }`        | Viewport resized                   |

### Listened

| Hook                | Action                           |
| ------------------- | -------------------------------- |
| `agent.stop.post`   | Close browser session            |
| `prompt.building`   | Add Playwright workflow guidance |
| `github:pr.opening` | Add Screenshots section to PR    |

## Cross-Plugin Integration

### Init Script Injection

Other plugins can inject scripts before navigation:

```typescript
// Plugin emits before navigating
hooks.emit("playwright:page.loading", {
  issueId,
  url: "https://app.example.com",
  initScripts: [], // Mutable array
});

// Test plugin could inject mocks
hooks.on("playwright:page.loading", (event) => {
  event.initScripts.push(`
    window.__MOCK_API__ = true;
    window.fetch = async (url) => {
      if (url.includes('/api/user')) {
        return { json: () => ({ name: 'Test User' }) };
      }
    };
  `);
});
```

### Screenshot Contribution to PRs

```typescript
hooks.on("github:pr.opening", async (event) => {
  const screenshots = await findScreenshots(event.worktreePath);

  if (screenshots.length > 0) {
    event.contributions.push({
      section: "Screenshots",
      content: screenshots
        .map((file) => `![${basename(file)}](./${file})`)
        .join("\n\n"),
      priority: 80, // After code changes, before footer
    });
  }
});
```

## Configuration

```toml
[plugins.playwright]
browserType = "chromium"  # "chromium" | "firefox" | "webkit"
viewportWidth = 1280
viewportHeight = 720
timeout = 30000           # Navigation/action timeout (ms)
headless = true           # Run without visible browser
```

## Usage Examples

### Agent Captures Screenshot

```typescript
// Agent navigates and screenshots
await tools.playwright_navigate({ url: "http://localhost:3000/login" });

// Navigate to a site with a self-signed certificate
await tools.playwright_navigate({
  url: "https://localhost:3443/dashboard",
  ignoreHTTPSErrors: true,
});

// Navigate with custom headers (e.g., custom User-Agent to bypass bot detection)
await tools.playwright_navigate({
  url: "https://example.com/api-page",
  extraHTTPHeaders: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Authorization": "Bearer token123",
  },
});
await tools.playwright_fill({ selector: "#email", value: "test@example.com" });
await tools.playwright_fill({ selector: "#password", value: "password123" });
await tools.playwright_click({ selector: "button[type=submit]" });
await tools.playwright_screenshot({
  path: "screenshots/login-success.png",
  fullPage: false,
});

// Screenshot saved to worktree
// When PR created, Screenshots section auto-added
```

### Debugging Console Errors

```typescript
// Plugin monitors console
page.on("console", (msg) => {
  if (msg.type() === "error") {
    hooks.emit("playwright:console.error", {
      issueId,
      message: msg.text(),
      location: msg.location(),
    });

    // Creates notification for agent
    memory.notifications.add({
      issueId,
      type: "browser_error",
      priority: "medium",
      message: `Console error: ${msg.text()}`,
    });
  }
});
```

### Page Content Extraction

```typescript
// Agent extracts page data
const content = await tools.playwright_get_page_content({
  format: "text", // or "html"
});

// Agent evaluates JavaScript
const data = await tools.playwright_evaluate({
  script: `
    return Array.from(document.querySelectorAll('.user-row'))
      .map(row => ({
        name: row.querySelector('.name').textContent,
        email: row.querySelector('.email').textContent,
      }));
  `,
});
```

## Dependencies on Core

| Import                    | Usage                            |
| ------------------------- | -------------------------------- |
| `definePlugin`            | Plugin definition                |
| `OrchestratorTool`        | Tool interface                   |
| `SteeringRuleConfigInput` | Steering rule definition         |
| `WorkhorseContext`        | Service access                   |
| `PromptContextBlock`      | Prompt enrichment                |
| `MemoryService`           | Notifications for browser events |

## Why This Architecture

1. **Session per issue** — Browser state isolated, no cross-contamination
2. **Lazy creation** — No browser overhead until agent needs it
3. **Auto-cleanup** — Sessions closed when agents stop, no leaks
4. **Init script hooks** — Testing plugins can inject mocks without coupling
5. **PR integration** — Screenshots automatically included in PRs
6. **Event visibility** — Console/network errors surfaced to agent
