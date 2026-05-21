/** Page interaction actions for Playwright browser connections. */
import type { BrowserConnection } from "./browser-connection.ts";
import type { Viewport } from "./types.ts";

/** Click an element on the current page. */
export async function clickElement(
  conn: BrowserConnection,
  selector: string,
  options: { timeout?: number } = {},
): Promise<void> {
  await conn.page.click(selector, {
    timeout: options.timeout ?? conn.config.timeout,
  });
}

/** Fill a form field on the current page. */
export async function fillField(
  conn: BrowserConnection,
  selector: string,
  value: string,
  options: { timeout?: number } = {},
): Promise<void> {
  await conn.page.fill(selector, value, {
    timeout: options.timeout ?? conn.config.timeout,
  });
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
export async function evaluateScript<T>(
  conn: BrowserConnection,
  script: string,
): Promise<T> {
  // biome-ignore lint/security/noGlobalEval: User-provided script evaluation is the intended use
  return conn.page.evaluate(script);
}

/** Set the viewport size for the page. */
export async function setViewport(
  conn: BrowserConnection,
  viewport: Viewport,
): Promise<void> {
  await conn.page.setViewportSize(viewport);
  conn.config.viewport = viewport;
}
