/**
 * Tests for browser-connection module
 *
 * Uses mocked Playwright to test connection management logic without
 * actually launching browsers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserConnectionConfig } from "../browser-connection.ts";

// Mock Playwright module
const mockPage = {
  on: vi.fn(),
  goto: vi.fn(),
  url: vi.fn(() => "https://example.com"),
  title: vi.fn(() => Promise.resolve("Example")),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn(),
  $: vi.fn(),
  content: vi.fn(() => Promise.resolve("<html></html>")),
  evaluate: vi.fn(),
  setViewportSize: vi.fn(),
  addInitScript: vi.fn(),
};

const mockContext = {
  newPage: vi.fn(() => Promise.resolve(mockPage)),
  close: vi.fn(),
};

const mockBrowser = {
  newContext: vi.fn(() => Promise.resolve(mockContext)),
  close: vi.fn(),
};

const mockChromium = {
  launch: vi.fn(() => Promise.resolve(mockBrowser)),
};

vi.mock("playwright", () => ({
  default: { chromium: mockChromium, firefox: mockChromium, webkit: mockChromium },
  chromium: mockChromium,
  firefox: mockChromium,
  webkit: mockChromium,
}));

// Import after mocking
const {
  launchBrowser,
  addInitScript,
  navigateTo,
  clickElement,
  fillField,
  takeScreenshot,
  getElementInfo,
  getPageContent,
  evaluateScript,
  setViewport,
  closeBrowser,
  getCurrentUrl,
  hasNavigated,
} = await import("../browser-connection.ts");

describe("browser-connection", () => {
  const defaultConfig: BrowserConnectionConfig = {
    browserType: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    timeout: 30000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockReturnValue("https://example.com");
  });

  describe("launchBrowser", () => {
    it("creates browser, context, and page", async () => {
      const conn = await launchBrowser(defaultConfig);

      expect(mockChromium.launch).toHaveBeenCalledWith({ headless: true });
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: { width: 1280, height: 720 },
      });
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(conn.browser).toBe(mockBrowser);
      expect(conn.context).toBe(mockContext);
      expect(conn.page).toBe(mockPage);
    });

    it("attaches console, request, and response listeners", async () => {
      await launchBrowser(defaultConfig);

      expect(mockPage.on).toHaveBeenCalledWith("console", expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith("request", expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith("response", expect.any(Function));
    });

    it("initializes empty arrays for messages and requests", async () => {
      const conn = await launchBrowser(defaultConfig);

      expect(conn.consoleMessages).toEqual([]);
      expect(conn.networkRequests).toEqual([]);
      expect(conn.initScripts).toEqual([]);
    });

    it("stores config in connection", async () => {
      const conn = await launchBrowser(defaultConfig);

      expect(conn.config).toEqual(defaultConfig);
    });
  });

  describe("addInitScript", () => {
    it("adds script to page and tracks it", async () => {
      const conn = await launchBrowser(defaultConfig);
      const script = "window.TEST = true;";

      await addInitScript(conn, script);

      expect(mockPage.addInitScript).toHaveBeenCalledWith(script);
      expect(conn.initScripts).toContain(script);
    });

    it("can add multiple scripts", async () => {
      const conn = await launchBrowser(defaultConfig);

      await addInitScript(conn, "script1");
      await addInitScript(conn, "script2");

      expect(conn.initScripts).toHaveLength(2);
      expect(mockPage.addInitScript).toHaveBeenCalledTimes(2);
    });
  });

  describe("navigateTo", () => {
    it("navigates to URL with default options", async () => {
      const conn = await launchBrowser(defaultConfig);

      const result = await navigateTo(conn, "https://example.com");

      expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
        waitUntil: "load",
        timeout: 30000,
      });
      expect(result.url).toBe("https://example.com");
      expect(result.title).toBe("Example");
    });

    it("uses custom waitUntil option", async () => {
      const conn = await launchBrowser(defaultConfig);

      await navigateTo(conn, "https://example.com", { waitUntil: "networkidle" });

      expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
    });

    it("uses custom timeout", async () => {
      const conn = await launchBrowser(defaultConfig);

      await navigateTo(conn, "https://example.com", { timeout: 5000 });

      expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
        waitUntil: "load",
        timeout: 5000,
      });
    });
  });

  describe("clickElement", () => {
    it("clicks element with default timeout", async () => {
      const conn = await launchBrowser(defaultConfig);

      await clickElement(conn, "button.submit");

      expect(mockPage.click).toHaveBeenCalledWith("button.submit", { timeout: 30000 });
    });

    it("uses custom timeout", async () => {
      const conn = await launchBrowser(defaultConfig);

      await clickElement(conn, "button", { timeout: 5000 });

      expect(mockPage.click).toHaveBeenCalledWith("button", { timeout: 5000 });
    });
  });

  describe("fillField", () => {
    it("fills field with value", async () => {
      const conn = await launchBrowser(defaultConfig);

      await fillField(conn, "input[name=email]", "test@example.com");

      expect(mockPage.fill).toHaveBeenCalledWith("input[name=email]", "test@example.com", {
        timeout: 30000,
      });
    });
  });

  describe("takeScreenshot", () => {
    it("takes screenshot with default options", async () => {
      const conn = await launchBrowser(defaultConfig);

      const path = await takeScreenshot(conn, "/tmp/screenshot.png");

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: "/tmp/screenshot.png",
        fullPage: false,
        type: "png",
        quality: undefined,
      });
      expect(path).toBe("/tmp/screenshot.png");
    });

    it("takes full page screenshot", async () => {
      const conn = await launchBrowser(defaultConfig);

      await takeScreenshot(conn, "/tmp/full.png", { fullPage: true });

      expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true }));
    });

    it("takes JPEG with quality", async () => {
      const conn = await launchBrowser(defaultConfig);

      await takeScreenshot(conn, "/tmp/photo.jpeg", { type: "jpeg", quality: 80 });

      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ type: "jpeg", quality: 80 }),
      );
    });
  });

  describe("getElementInfo", () => {
    it("returns found:false when element not found", async () => {
      mockPage.$.mockResolvedValueOnce(null);
      const conn = await launchBrowser(defaultConfig);

      const info = await getElementInfo(conn, ".missing");

      expect(info).toEqual({ found: false });
    });

    it("returns element info when found", async () => {
      const mockElement = {
        evaluate: vi.fn(() => Promise.resolve("button")),
        textContent: vi.fn(() => Promise.resolve("Click me")),
        boundingBox: vi.fn(() => Promise.resolve({ x: 10, y: 20, width: 100, height: 50 })),
      };
      mockPage.$.mockResolvedValueOnce(mockElement);
      const conn = await launchBrowser(defaultConfig);

      const info = await getElementInfo(conn, "button");

      expect(info.found).toBe(true);
      expect(info.tagName).toBe("button");
      expect(info.textContent).toBe("Click me");
      expect(info.boundingBox).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("truncates long text content", async () => {
      const longText = "x".repeat(1000);
      const mockElement = {
        evaluate: vi.fn(() => Promise.resolve("div")),
        textContent: vi.fn(() => Promise.resolve(longText)),
        boundingBox: vi.fn(() => Promise.resolve(null)),
      };
      mockPage.$.mockResolvedValueOnce(mockElement);
      const conn = await launchBrowser(defaultConfig);

      const info = await getElementInfo(conn, "div");

      expect(info.textContent?.length).toBe(500);
    });
  });

  describe("getPageContent", () => {
    it("returns page HTML content", async () => {
      const conn = await launchBrowser(defaultConfig);

      const content = await getPageContent(conn);

      expect(content).toBe("<html></html>");
    });
  });

  describe("evaluateScript", () => {
    it("evaluates script in page context", async () => {
      mockPage.evaluate.mockResolvedValueOnce({ foo: "bar" });
      const conn = await launchBrowser(defaultConfig);

      const result = await evaluateScript(conn, "return { foo: 'bar' }");

      expect(mockPage.evaluate).toHaveBeenCalledWith("return { foo: 'bar' }");
      expect(result).toEqual({ foo: "bar" });
    });
  });

  describe("setViewport", () => {
    it("sets viewport and updates config", async () => {
      const conn = await launchBrowser(defaultConfig);
      const newViewport = { width: 1920, height: 1080 };

      await setViewport(conn, newViewport);

      expect(mockPage.setViewportSize).toHaveBeenCalledWith(newViewport);
      expect(conn.config.viewport).toEqual(newViewport);
    });
  });

  describe("closeBrowser", () => {
    it("closes context and browser", async () => {
      const conn = await launchBrowser(defaultConfig);

      await closeBrowser(conn);

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe("getCurrentUrl", () => {
    it("returns current page URL", async () => {
      const conn = await launchBrowser(defaultConfig);

      const url = getCurrentUrl(conn);

      expect(url).toBe("https://example.com");
    });
  });

  describe("hasNavigated", () => {
    it("returns false for about:blank", async () => {
      mockPage.url.mockReturnValue("about:blank");
      const conn = await launchBrowser(defaultConfig);

      expect(hasNavigated(conn)).toBe(false);
    });

    it("returns false for empty string", async () => {
      mockPage.url.mockReturnValue("");
      const conn = await launchBrowser(defaultConfig);

      expect(hasNavigated(conn)).toBe(false);
    });

    it("returns true for actual URL", async () => {
      mockPage.url.mockReturnValue("https://example.com");
      const conn = await launchBrowser(defaultConfig);

      expect(hasNavigated(conn)).toBe(true);
    });
  });
});
