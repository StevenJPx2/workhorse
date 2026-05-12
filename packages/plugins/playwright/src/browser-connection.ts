/**
 * Persistent Browser Connection Manager
 *
 * Manages long-lived Playwright browser connections that persist across operations.
 * Each session maintains a single browser instance with a reusable page context.
 *
 * @module workhorse-plugin-playwright/browser-connection
 */

import type {
  Browser,
  BrowserContext,
  ConsoleMessage as PWConsoleMessage,
  Page,
  Request,
  Response,
} from "playwright";
import type { BrowserType, ConsoleMessage, NetworkRequest, Viewport } from "./types.ts";

export interface BrowserConnectionConfig {
  browserType: BrowserType;
  headless: boolean;
  viewport: Viewport;
  timeout: number;
}

export interface BrowserConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  config: BrowserConnectionConfig;
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
  initScripts: string[];
}

/** Launch a new browser and create a connection with a ready-to-use page. */
export async function launchBrowser(config: BrowserConnectionConfig): Promise<BrowserConnection> {
  const browser = await import("playwright").then((pw) =>
    pw[config.browserType].launch({ headless: config.headless }),
  );
  const context = await browser.newContext({ viewport: config.viewport });
  const page = await context.newPage();
  const consoleMessages: ConsoleMessage[] = [];
  const networkRequests: NetworkRequest[] = [];

  page.on("console", (msg: PWConsoleMessage) => {
    const type = msg.type();
    consoleMessages.push({
      type: type === "warning" ? "warn" : (type as ConsoleMessage["type"]),
      text: msg.text(),
      timestamp: Date.now(),
    });
  });

  page.on("request", (req: Request) => {
    networkRequests.push({
      url: req.url(),
      method: req.method(),
      timing: { startTime: Date.now() },
    });
  });

  page.on("response", (res: Response) => {
    const existing = networkRequests.find((r) => r.url === res.url() && !r.status);
    if (existing) {
      existing.status = res.status();
      if (existing.timing) existing.timing.responseTime = Date.now();
    }
  });

  return { browser, context, page, config, consoleMessages, networkRequests, initScripts: [] };
}

/** Add an init script to the page. Init scripts run before any page script on every navigation. */
export async function addInitScript(conn: BrowserConnection, script: string): Promise<void> {
  await conn.page.addInitScript(script);
  conn.initScripts.push(script);
}

/** Navigate to a URL in the persistent page. */
export async function navigateTo(
  conn: BrowserConnection,
  url: string,
  options: { waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeout?: number } = {},
): Promise<{ url: string; title: string }> {
  await conn.page.goto(url, {
    waitUntil: options.waitUntil ?? "load",
    timeout: options.timeout ?? conn.config.timeout,
  });
  return { url: conn.page.url(), title: await conn.page.title() };
}

/** Click an element on the current page. */
export async function clickElement(
  conn: BrowserConnection,
  selector: string,
  options: { timeout?: number } = {},
): Promise<void> {
  await conn.page.click(selector, { timeout: options.timeout ?? conn.config.timeout });
}

/** Fill a form field on the current page. */
export async function fillField(
  conn: BrowserConnection,
  selector: string,
  value: string,
  options: { timeout?: number } = {},
): Promise<void> {
  await conn.page.fill(selector, value, { timeout: options.timeout ?? conn.config.timeout });
}

/** Take a screenshot of the current page. */
export async function takeScreenshot(
  conn: BrowserConnection,
  outputPath: string,
  options: { fullPage?: boolean; type?: "png" | "jpeg"; quality?: number } = {},
): Promise<string> {
  await conn.page.screenshot({
    path: outputPath,
    fullPage: options.fullPage ?? false,
    type: options.type ?? "png",
    quality: options.type === "jpeg" ? options.quality : undefined,
  });
  return outputPath;
}

/** Get information about an element on the current page. */
export async function getElementInfo(
  conn: BrowserConnection,
  selector: string,
): Promise<{
  found: boolean;
  tagName?: string;
  textContent?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}> {
  const element = await conn.page.$(selector);
  if (!element) return { found: false };
  const [tagName, textContent, boundingBox] = await Promise.all([
    element.evaluate((el) => el.tagName.toLowerCase()),
    element.textContent(),
    element.boundingBox(),
  ]);
  return {
    found: true,
    tagName,
    textContent: textContent?.slice(0, 500) ?? undefined,
    boundingBox: boundingBox ?? undefined,
  };
}

/** Get the full HTML content of the current page. */
export async function getPageContent(conn: BrowserConnection): Promise<string> {
  return conn.page.content();
}

/** Evaluate JavaScript in the page context. */
export async function evaluateScript<T>(conn: BrowserConnection, script: string): Promise<T> {
  // biome-ignore lint/security/noGlobalEval: User-provided script evaluation is the intended use
  return conn.page.evaluate(script);
}

/** Set the viewport size for the page. */
export async function setViewport(conn: BrowserConnection, viewport: Viewport): Promise<void> {
  await conn.page.setViewportSize(viewport);
  conn.config.viewport = viewport;
}

/** Close the browser connection and release all resources. */
export async function closeBrowser(conn: BrowserConnection): Promise<void> {
  await conn.context.close();
  await conn.browser.close();
}

/** Get the current URL of the page. */
export function getCurrentUrl(conn: BrowserConnection): string {
  return conn.page.url();
}

/** Check if the page has navigated to a URL (not about:blank). */
export function hasNavigated(conn: BrowserConnection): boolean {
  const url = conn.page.url();
  return url !== "about:blank" && url !== "";
}
