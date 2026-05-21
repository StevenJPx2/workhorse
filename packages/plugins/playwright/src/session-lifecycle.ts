/** Session lifecycle operations for PlaywrightSessionManager. */
import type { HookEmitter } from "workhorse-core";

import {
  type BrowserConnection,
  closeBrowser,
  launchBrowser,
} from "./browser-connection.ts";
import type { BrowserSession, BrowserType, Viewport } from "./types.ts";

export interface SessionState {
  session: BrowserSession;
  connection: BrowserConnection;
}

/** Create a new browser session for an issue. */
export async function createSession(
  hooks: HookEmitter,
  issueId: string,
  sessionId: string,
  browserType: BrowserType,
  viewport: Viewport,
  timeout: number,
): Promise<SessionState> {
  hooks.emit("playwright:session.started", { issueId, sessionId, browserType });

  return {
    session: {
      id: sessionId,
      issueId,
      browserType,
      isActive: true,
      startedAt: Date.now(),
    },
    connection: await launchBrowser({
      browserType,
      headless: true,
      viewport,
      timeout,
    }),
  };
}

/** Close a browser session and emit cleanup event. */
export async function closeSessionState(
  hooks: HookEmitter,
  state: SessionState,
): Promise<void> {
  state.session.isActive = false;
  await closeBrowser(state.connection);
  hooks.emit("playwright:session.closed", {
    issueId: state.session.issueId,
    sessionId: state.session.id,
  });
}
