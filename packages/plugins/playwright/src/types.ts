/**
 * Playwright Plugin Types
 *
 * @module workhorse-plugin-playwright/types
 */

/** Browser type supported by Playwright */
export type BrowserType = "chromium" | "firefox" | "webkit";

/** Screenshot format */
export type ScreenshotFormat = "png" | "jpeg";

/** Viewport configuration */
export interface Viewport {
  width: number;
  height: number;
}

/** Screenshot options */
export interface ScreenshotOptions {
  /** Full page screenshot (default: false) */
  fullPage?: boolean;
  /** Screenshot format (default: png) */
  format?: ScreenshotFormat;
  /** JPEG quality 0-100 (only for jpeg format) */
  quality?: number;
}

/** Navigation options */
export interface NavigationOptions {
  /** Wait until condition (default: load) */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  /** Timeout in milliseconds */
  timeout?: number;
  /** Run browser in headless mode (default: true). Set to false to see the browser window. */
  headless?: boolean;
  /** Ignore HTTPS errors (e.g., self-signed certificates). Recreates browser context if changed. */
  ignoreHTTPSErrors?: boolean;
  /** Extra HTTP headers to send with every request (e.g., User-Agent, Authorization). */
  extraHTTPHeaders?: Record<string, string>;
}

/** Element selector result */
export interface ElementInfo {
  /** Whether the element was found */
  found: boolean;
  /** Element tag name */
  tagName?: string;
  /** Element text content */
  textContent?: string;
  /** Element bounding box */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Element attributes */
  attributes?: Record<string, string>;
}

/** Page info returned from navigate */
export interface PageInfo {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Viewport dimensions */
  viewport: Viewport;
}

/** Console message from page */
export interface ConsoleMessage {
  /** Message type */
  type: "log" | "info" | "warn" | "error" | "debug";
  /** Message text */
  text: string;
  /** Timestamp */
  timestamp: number;
}

/** Network request info */
export interface NetworkRequest {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Response status code */
  status?: number;
  /** Request timing */
  timing?: {
    startTime: number;
    responseTime?: number;
  };
}

/** Browser session state */
export interface BrowserSession {
  /** Session ID */
  id: string;
  /** Issue ID this session belongs to */
  issueId: string;
  /** Browser type */
  browserType: BrowserType;
  /** Whether the session is active */
  isActive: boolean;
  /** Current page URL */
  currentUrl?: string;
  /** Session start time */
  startedAt: number;
}
