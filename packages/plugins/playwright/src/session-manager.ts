import type { HookEmitter } from "workhorse-core";

import {
  addInitScript,
  getCurrentUrl,
  hasNavigated,
  navigateTo,
} from "./browser-connection.ts";
import { setViewport as setConnectionViewport } from "./page-actions.ts";
import {
  type SessionState,
  closeSessionState,
  createSession,
} from "./session-lifecycle.ts";
import type {
  BrowserSession,
  BrowserType,
  ConsoleMessage,
  NavigationOptions,
  NetworkRequest,
  PageInfo,
  Viewport,
} from "./types.ts";

/** Manages Playwright browser sessions. One session per issue, lazy creation, auto-cleanup on agent stop. */
export class PlaywrightSessionManager {
  private sessions = new Map<string, SessionState>();
  private sessionCounter = 0;

  constructor(
    private hooks: HookEmitter,
    private defaultBrowserType: BrowserType = "chromium",
    private defaultViewport: Viewport = { width: 1280, height: 720 },
    private defaultTimeout: number = 30000,
  ) {}

  /** Get or create session. Recreates if ignoreHTTPSErrors/headless changed. */
  async getOrCreateSession(
    issueId: string,
    browserType: BrowserType = this.defaultBrowserType,
    ignoreHTTPSErrors = false,
    headless = true,
  ): Promise<BrowserSession> {
    const existing = this.sessions.get(issueId);
    if (existing?.session.isActive) {
      const cfg = existing.connection.config;
      if (
        (ignoreHTTPSErrors && !cfg.ignoreHTTPSErrors) ||
        cfg.headless !== headless
      )
        await this.closeSession(issueId);
      else return existing.session;
    }
    const state = await createSession(
      this.hooks,
      issueId,
      `playwright-${++this.sessionCounter}-${Date.now()}`,
      browserType,
      this.defaultViewport,
      this.defaultTimeout,
      ignoreHTTPSErrors,
      headless,
    );
    this.sessions.set(issueId, state);
    return state.session;
  }

  async closeSession(issueId: string): Promise<void> {
    const state = this.sessions.get(issueId);
    if (!state) return;
    await closeSessionState(this.hooks, state);
    this.sessions.delete(issueId);
  }
  async closeAllSessions(): Promise<void> {
    await Promise.all(
      [...this.sessions.keys()].map((id) => this.closeSession(id)),
    );
  }
  hasActiveSession(issueId: string): boolean {
    return this.sessions.get(issueId)?.session.isActive ?? false;
  }
  getSession(issueId: string): BrowserSession | null {
    return this.sessions.get(issueId)?.session ?? null;
  }
  getSessionState(issueId: string): SessionState | { error: string } {
    const state = this.sessions.get(issueId);
    if (!state?.session.isActive)
      return { error: "No active session. Call navigate first." };
    if (!hasNavigated(state.connection))
      return { error: "No page loaded. Call navigate with a URL." };
    return state;
  }

  async navigate(
    issueId: string,
    url: string,
    options: NavigationOptions = {},
  ): Promise<{ success: boolean; pageInfo?: PageInfo; error?: string }> {
    try {
      const session = await this.getOrCreateSession(
        issueId,
        this.defaultBrowserType,
        options.ignoreHTTPSErrors ?? false,
        options.headless ?? true,
      );
      const state = this.sessions.get(issueId)!;

      // Emit hook for init script injection
      const ctx = {
        issueId,
        sessionId: session.id,
        url,
        browserType: session.browserType,
        initScripts: [] as string[],
      };
      this.hooks.emit("playwright:page.loading", ctx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const script of ctx.initScripts)
        if (!state.connection.initScripts.includes(script))
          await addInitScript(state.connection, script);
      // Merge and persist extra HTTP headers across navigations
      if (options.extraHTTPHeaders)
        Object.assign(
          state.connection.extraHTTPHeaders,
          options.extraHTTPHeaders,
        );
      const h = state.connection.extraHTTPHeaders;
      if (Object.keys(h).length > 0)
        await state.connection.page.setExtraHTTPHeaders(h);

      const result = await navigateTo(state.connection, url, {
        waitUntil: options.waitUntil ?? "load",
        timeout: options.timeout ?? this.defaultTimeout,
      });
      state.session.currentUrl = result.url;

      this.hooks.emit("playwright:page.navigated", {
        issueId,
        sessionId: session.id,
        url: result.url,
        title: result.title,
      });
      return {
        success: true,
        pageInfo: {
          url: result.url,
          title: result.title,
          viewport: state.connection.config.viewport,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Set the viewport size for the session. */
  async setViewport(
    issueId: string,
    viewport: Viewport,
  ): Promise<{ success: boolean; error?: string }> {
    const state = this.sessions.get(issueId);
    if (!state?.session.isActive)
      return { success: false, error: "No active browser session" };
    try {
      await setConnectionViewport(state.connection, viewport);
      this.hooks.emit("playwright:viewport.changed", {
        issueId,
        sessionId: state.session.id,
        viewport,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getCurrentUrl(issueId: string): string | null {
    const s = this.sessions.get(issueId);
    return s?.session.isActive ? getCurrentUrl(s.connection) : null;
  }
  getConsoleMessages(id: string): ConsoleMessage[] {
    return this.sessions.get(id)?.connection.consoleMessages ?? [];
  }
  getNetworkRequests(id: string): NetworkRequest[] {
    return this.sessions.get(id)?.connection.networkRequests ?? [];
  }
  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }
  getHooks(): HookEmitter {
    return this.hooks;
  }
}
