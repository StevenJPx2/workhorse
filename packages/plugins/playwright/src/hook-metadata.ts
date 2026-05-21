/**
 * Registers hook metadata for the Playwright plugin.
 *
 * This provides documentation for hooks emitted by this plugin,
 * used by the plugin-development skill to show available hooks.
 *
 * @module workhorse-plugin-playwright/hook-metadata
 */

import { registerHookMetadata } from "workhorse-core";

/**
 * Register all Playwright plugin hook metadata.
 * Called during plugin setup.
 */
export function registerPlaywrightHookMetadata(): void {
  registerHookMetadata({
    name: "playwright:session.started",
    category: "Playwright",
    description: "Emitted when a browser session is started for an issue",
    payload:
      '{ issueId: string, sessionId: string, browserType: "chromium" | "firefox" | "webkit" }',
    plugin: "playwright",
  });

  registerHookMetadata({
    name: "playwright:session.closed",
    category: "Playwright",
    description: "Emitted when a browser session is closed",
    payload: "{ issueId: string, sessionId: string }",
    plugin: "playwright",
  });

  registerHookMetadata({
    name: "playwright:page.loading",
    category: "Playwright",
    description:
      "Emitted before a page navigates. Handlers can push to initScripts array to inject scripts via page.addInitScript().",
    payload:
      '{ issueId: string, sessionId: string, url: string, browserType: "chromium" | "firefox" | "webkit", initScripts: string[] }',
    plugin: "playwright",
    example: `ctx.hooks.on("playwright:page.loading", (event: unknown) => {
  const ctx = event as PageLoadingContext;
  ctx.initScripts.push(\`
    window.__TEST_MODE__ = true;
    window.__MOCK_API__ = { fetch: () => Promise.resolve({}) };
  \`);
});`,
  });

  registerHookMetadata({
    name: "playwright:page.navigated",
    category: "Playwright",
    description: "Emitted when a page navigation completes",
    payload:
      "{ issueId: string, sessionId: string, url: string, title: string }",
    plugin: "playwright",
  });

  registerHookMetadata({
    name: "playwright:screenshot.taken",
    category: "Playwright",
    description: "Emitted when a screenshot is captured",
    payload:
      "{ issueId: string, sessionId: string, path: string, options: ScreenshotOptions }",
    plugin: "playwright",
  });

  registerHookMetadata({
    name: "playwright:console.error",
    category: "Playwright",
    description: "Emitted when console errors are detected on the page",
    payload:
      "{ issueId: string, sessionId: string, messages: Array<{ text: string, timestamp: number }> }",
    plugin: "playwright",
  });

  registerHookMetadata({
    name: "playwright:network.failed",
    category: "Playwright",
    description: "Emitted when a network request fails",
    payload:
      "{ issueId: string, sessionId: string, url: string, error: string }",
    plugin: "playwright",
  });

  registerHookMetadata({
    name: "playwright:viewport.changed",
    category: "Playwright",
    description: "Emitted when the viewport is resized",
    payload:
      "{ issueId: string, sessionId: string, viewport: { width: number, height: number } }",
    plugin: "playwright",
  });
}
