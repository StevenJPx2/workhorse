/**
 * Playwright Plugin Hook Types
 *
 * Defines hook events emitted by the Playwright plugin for cross-plugin coordination.
 * Other plugins can listen to these hooks via `ctx.hooks.on("playwright:page.navigated", ...)`.
 *
 * Hook naming convention: `{plugin}:{entity}.{event}`
 *
 * @module @stevenjpx2/jiratown-plugin-playwright/hooks
 */

import type { BrowserType, ScreenshotOptions, Viewport } from "./types.ts";

/**
 * Context for the `playwright:page.loading` hook.
 * Handlers can push scripts to `initScripts` to inject them before page load.
 */
export interface PageLoadingContext {
  issueId: string;
  sessionId: string;
  url: string;
  browserType: BrowserType;
  /**
   * Scripts to inject before the page loads.
   * Push JavaScript code strings to this array to have them executed
   * via `page.addInitScript()` before navigation.
   *
   * @example
   * ```typescript
   * ctx.hooks.on("playwright:page.loading", (event) => {
   *   event.initScripts.push(`
   *     window.__TEST_MODE__ = true;
   *     window.__MOCK_API__ = { fetch: () => Promise.resolve({}) };
   *   `);
   * });
   * ```
   */
  initScripts: string[];
}

/**
 * Playwright plugin hook event types.
 *
 * Use module augmentation in consuming code to get type safety:
 *
 * @example
 * ```typescript
 * declare module "workhorse-core" {
 *   interface HookEventMap extends PlaywrightPluginHooks {}
 * }
 * ```
 */
export interface PlaywrightPluginHooks {
  /** Emitted when a browser session is started */
  "playwright:session.started": {
    issueId: string;
    sessionId: string;
    browserType: BrowserType;
  };

  /** Emitted when a browser session is closed */
  "playwright:session.closed": {
    issueId: string;
    sessionId: string;
  };

  /**
   * Emitted before a page is navigated, allowing plugins to inject init scripts.
   * Handlers should push JavaScript code strings to `initScripts` array.
   * Scripts are executed via Playwright's `page.addInitScript()` before navigation.
   *
   * @example
   * ```typescript
   * ctx.hooks.on("playwright:page.loading", async (event: unknown) => {
   *   const ctx = event as PageLoadingContext;
   *   ctx.initScripts.push(`window.__INJECTED__ = true;`);
   * });
   * ```
   */
  "playwright:page.loading": PageLoadingContext;

  /** Emitted when a page is navigated */
  "playwright:page.navigated": {
    issueId: string;
    sessionId: string;
    url: string;
    title: string;
  };

  /** Emitted when a screenshot is taken */
  "playwright:screenshot.taken": {
    issueId: string;
    sessionId: string;
    path: string;
    options: ScreenshotOptions;
  };

  /** Emitted when page console has errors */
  "playwright:console.error": {
    issueId: string;
    sessionId: string;
    messages: Array<{
      text: string;
      timestamp: number;
    }>;
  };

  /** Emitted when a network request fails */
  "playwright:network.failed": {
    issueId: string;
    sessionId: string;
    url: string;
    error: string;
  };

  /** Emitted when viewport is changed */
  "playwright:viewport.changed": {
    issueId: string;
    sessionId: string;
    viewport: Viewport;
  };
}

/**
 * Note on type safety:
 *
 * The core HookEventMap uses `Record<string, unknown>` to allow custom hook names.
 * Since it's a type alias (not interface), module augmentation doesn't work.
 *
 * For type-safe hook handling in listeners, cast the event payload:
 * ```typescript
 * ctx.hooks.on("playwright:page.navigated", (event: unknown) => {
 *   const { issueId, url } = event as PlaywrightPluginHooks["playwright:page.navigated"];
 * });
 * ```
 */
