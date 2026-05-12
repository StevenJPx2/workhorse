/**
 * Playwright Session Operations - browser operations on managed sessions.
 *
 * Provides high-level operations (screenshot, click, fill, etc.) that work
 * with the session manager to interact with persistent browser connections.
 *
 * @module @jiratown/plugin-playwright/session-operations
 */

import {
  clickElement,
  evaluateScript,
  fillField,
  getElementInfo,
  getPageContent,
  takeScreenshot,
} from "./browser-connection.ts";
import type { PlaywrightSessionManager } from "./session-manager.ts";
import type { ElementInfo, ScreenshotOptions } from "./types.ts";

/** Take a screenshot of the current page. */
export async function screenshot(
  manager: PlaywrightSessionManager,
  issueId: string,
  outputPath: string,
  options: ScreenshotOptions = {},
): Promise<{ success: boolean; path?: string; error?: string }> {
  const state = manager.getSessionState(issueId);
  if ("error" in state) return { success: false, error: state.error };
  try {
    await takeScreenshot(state.connection, outputPath, {
      fullPage: options.fullPage,
      type: options.format === "jpeg" ? "jpeg" : "png",
      quality: options.quality,
    });
    manager
      .getHooks()
      .emit("playwright:screenshot.taken", {
        issueId,
        sessionId: state.session.id,
        path: outputPath,
        options,
      });
    return { success: true, path: outputPath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Click an element on the current page. */
export async function click(
  manager: PlaywrightSessionManager,
  issueId: string,
  selector: string,
): Promise<{ success: boolean; error?: string }> {
  const state = manager.getSessionState(issueId);
  if ("error" in state) return { success: false, error: state.error };
  try {
    await clickElement(state.connection, selector, { timeout: manager.getDefaultTimeout() });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Fill a form field on the current page. */
export async function fill(
  manager: PlaywrightSessionManager,
  issueId: string,
  selector: string,
  value: string,
): Promise<{ success: boolean; error?: string }> {
  const state = manager.getSessionState(issueId);
  if ("error" in state) return { success: false, error: state.error };
  try {
    await fillField(state.connection, selector, value, { timeout: manager.getDefaultTimeout() });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Get information about an element on the current page. */
export async function getElement(
  manager: PlaywrightSessionManager,
  issueId: string,
  selector: string,
): Promise<{ success: boolean; element?: ElementInfo; error?: string }> {
  const state = manager.getSessionState(issueId);
  if ("error" in state) return { success: false, error: state.error };
  try {
    const info = await getElementInfo(state.connection, selector);
    if (!info.found) return { success: false, error: `Element not found: ${selector}` };
    return {
      success: true,
      element: {
        found: true,
        tagName: info.tagName,
        textContent: info.textContent,
        boundingBox: info.boundingBox,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Get the full HTML content of the current page. */
export async function getContent(
  manager: PlaywrightSessionManager,
  issueId: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  const state = manager.getSessionState(issueId);
  if ("error" in state) return { success: false, error: state.error };
  try {
    return { success: true, content: await getPageContent(state.connection) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Evaluate JavaScript in the page context. */
export async function evaluate(
  manager: PlaywrightSessionManager,
  issueId: string,
  expression: string,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const state = manager.getSessionState(issueId);
  if ("error" in state) return { success: false, error: state.error };
  try {
    return { success: true, result: await evaluateScript(state.connection, expression) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
