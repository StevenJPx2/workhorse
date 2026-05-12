/** Playwright Session Manager - manages persistent browser sessions per issue. */
import type { HookEmitter } from "@stevenjpx2/jiratown-core";
import {
  addInitScript,
  closeBrowser,
  getCurrentUrl,
  hasNavigated,
  launchBrowser,
  navigateTo,
  setViewport,
  type BrowserConnection,
} from "./browser-connection.ts";
import type {
  BrowserSession,
  BrowserType,
  ConsoleMessage,
  NavigationOptions,
  NetworkRequest,
  PageInfo,
  Viewport,
} from "./types.ts";

/** Internal session state with browser connection */
export interface SessionState {
  session: BrowserSession;
  connection: BrowserConnection;
}

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

  /** Get an existing session or create a new one for the given issue. */
  async getOrCreateSession(
    issueId: string,
    browserType: BrowserType = this.defaultBrowserType,
  ): Promise<BrowserSession> {
    const existing = this.sessions.get(issueId);
    if (existing?.session.isActive) return existing.session;

    const sessionId = `playwright-${++this.sessionCounter}-${Date.now()}`;
    const session: BrowserSession = {
      id: sessionId,
      issueId,
      browserType,
      isActive: true,
      startedAt: Date.now(),
    };

    this.sessions.set(issueId, {
      session,
      connection: await launchBrowser({
        browserType,
        headless: true,
        viewport: this.defaultViewport,
        timeout: this.defaultTimeout,
      }),
    });
    this.hooks.emit("playwright:session.started", { issueId, sessionId, browserType });
    return session;
  }

  /** Close and cleanup a session for the given issue. */
  async closeSession(issueId: string): Promise<void> {
    const state = this.sessions.get(issueId);
    if (!state) return;
    state.session.isActive = false;
    await closeBrowser(state.connection);
    this.sessions.delete(issueId);
    this.hooks.emit("playwright:session.closed", { issueId, sessionId: state.session.id });
  }

  /** Close all active sessions. Called during agent shutdown. */
  async closeAllSessions(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.closeSession(id)));
  }

  /** Check if a session is active for the given issue. */
  hasActiveSession(issueId: string): boolean {
    return this.sessions.get(issueId)?.session.isActive ?? false;
  }

  /** Get the session for an issue, if it exists. */
  getSession(issueId: string): BrowserSession | null {
    return this.sessions.get(issueId)?.session ?? null;
  }

  /** Get internal session state. Returns error object if session not ready. */
  getSessionState(issueId: string): SessionState | { error: string } {
    const state = this.sessions.get(issueId);
    if (!state?.session.isActive)
      return { error: "No active browser session. Call navigate first." };
    if (!hasNavigated(state.connection))
      return { error: "No page loaded. Call navigate with a URL first." };
    return state;
  }

  /** Navigate to a URL. Creates a session if one doesn't exist. */
  async navigate(
    issueId: string,
    url: string,
    options: NavigationOptions = {},
  ): Promise<{ success: boolean; pageInfo?: PageInfo; error?: string }> {
    try {
      const session = await this.getOrCreateSession(issueId);
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

      // Add collected init scripts
      for (const script of ctx.initScripts) {
        if (!state.connection.initScripts.includes(script))
          await addInitScript(state.connection, script);
      }

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
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Set the viewport size for the session. */
  async setViewport(
    issueId: string,
    viewport: Viewport,
  ): Promise<{ success: boolean; error?: string }> {
    const state = this.sessions.get(issueId);
    if (!state?.session.isActive) return { success: false, error: "No active browser session" };
    try {
      await setViewport(state.connection, viewport);
      this.hooks.emit("playwright:viewport.changed", {
        issueId,
        sessionId: state.session.id,
        viewport,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  getCurrentUrl(issueId: string): string | null {
    const s = this.sessions.get(issueId);
    return s?.session.isActive ? getCurrentUrl(s.connection) : null;
  }
  getConsoleMessages(issueId: string): ConsoleMessage[] {
    return this.sessions.get(issueId)?.connection.consoleMessages ?? [];
  }
  getNetworkRequests(issueId: string): NetworkRequest[] {
    return this.sessions.get(issueId)?.connection.networkRequests ?? [];
  }
  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }
  getHooks(): HookEmitter {
    return this.hooks;
  }
}
