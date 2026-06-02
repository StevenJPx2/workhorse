/** Tests for PlaywrightSessionManager */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLaunchBrowser = vi.fn();
const mockCloseBrowser = vi.fn();
const mockNavigateTo = vi.fn();
const mockSetViewport = vi.fn();
const mockGetCurrentUrl = vi.fn();
const mockHasNavigated = vi.fn();
const mockAddInitScript = vi.fn();

vi.mock("../browser-connection.ts", () => ({
  launchBrowser: mockLaunchBrowser,
  closeBrowser: mockCloseBrowser,
  navigateTo: mockNavigateTo,
  getCurrentUrl: mockGetCurrentUrl,
  hasNavigated: mockHasNavigated,
  addInitScript: mockAddInitScript,
}));
vi.mock("../page-actions.ts", () => ({ setViewport: mockSetViewport }));

const { PlaywrightSessionManager } = await import("../session-manager.ts");
const createMockHooks = () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() });
const mockConn = (opts: Record<string, unknown> = {}) => ({
  config: { viewport: { width: 1280, height: 720 }, headless: true, ...opts },
  initScripts: [],
  extraHTTPHeaders: {},
  ...opts,
});

describe("PlaywrightSessionManager", () => {
  let sessionManager: InstanceType<typeof PlaywrightSessionManager>;
  let mockHooks: ReturnType<typeof createMockHooks>;
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks = createMockHooks();
    // biome-ignore lint/suspicious/noExplicitAny: Mock type
    sessionManager = new PlaywrightSessionManager(
      mockHooks as any,
      "chromium",
      { width: 1280, height: 720 },
      30000,
    );
  });

  describe("constructor", () => {
    it("initializes with default values", () => {
      expect(sessionManager.getDefaultTimeout()).toBe(30000);
      expect(sessionManager.getHooks()).toBe(mockHooks);
    });
  });

  describe("hasActiveSession", () => {
    it("returns false when no session exists", () => {
      expect(sessionManager.hasActiveSession("issue-1")).toBe(false);
    });

    it("returns true after creating a session", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      await sessionManager.getOrCreateSession("issue-1");
      expect(sessionManager.hasActiveSession("issue-1")).toBe(true);
    });
  });

  describe("getSession", () => {
    it("returns null when no session exists", () => {
      expect(sessionManager.getSession("issue-1")).toBeNull();
    });

    it("returns session after creation", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      await sessionManager.getOrCreateSession("issue-1");
      const session = sessionManager.getSession("issue-1");
      expect(session).not.toBeNull();
      expect(session?.issueId).toBe("issue-1");
      expect(session?.browserType).toBe("chromium");
      expect(session?.isActive).toBe(true);
    });
  });

  describe("getOrCreateSession", () => {
    it("creates a new session and launches browser", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      const session = await sessionManager.getOrCreateSession("issue-1");
      expect(mockLaunchBrowser).toHaveBeenCalledWith({
        browserType: "chromium",
        headless: true,
        viewport: { width: 1280, height: 720 },
        timeout: 30000,
        ignoreHTTPSErrors: false,
      });
      expect(session.issueId).toBe("issue-1");
      expect(session.isActive).toBe(true);
    });

    it("emits session.started event", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      const session = await sessionManager.getOrCreateSession("issue-1");
      expect(mockHooks.emit).toHaveBeenCalledWith(
        "playwright:session.started",
        {
          issueId: "issue-1",
          sessionId: session.id,
          browserType: "chromium",
        },
      );
    });

    it("returns existing session if active", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      const session1 = await sessionManager.getOrCreateSession("issue-1");
      const session2 = await sessionManager.getOrCreateSession("issue-1");
      expect(session1).toBe(session2);
      expect(mockLaunchBrowser).toHaveBeenCalledTimes(1);
    });

    it("uses custom browser type", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      const session = await sessionManager.getOrCreateSession(
        "issue-1",
        "firefox",
      );
      expect(session.browserType).toBe("firefox");
      expect(mockLaunchBrowser).toHaveBeenCalledWith(
        expect.objectContaining({ browserType: "firefox" }),
      );
    });

    it("creates session with ignoreHTTPSErrors", async () => {
      mockLaunchBrowser.mockResolvedValue(
        mockConn({ ignoreHTTPSErrors: true }),
      );
      await sessionManager.getOrCreateSession("issue-1", "chromium", true);
      expect(mockLaunchBrowser).toHaveBeenCalledWith({
        browserType: "chromium",
        headless: true,
        viewport: { width: 1280, height: 720 },
        timeout: 30000,
        ignoreHTTPSErrors: true,
      });
    });

    it("recreates session when ignoreHTTPSErrors changes from false to true", async () => {
      mockLaunchBrowser
        .mockResolvedValueOnce(mockConn({ ignoreHTTPSErrors: false }))
        .mockResolvedValueOnce(mockConn({ ignoreHTTPSErrors: true }));
      mockCloseBrowser.mockResolvedValue(undefined);
      const session1 = await sessionManager.getOrCreateSession("issue-1");
      expect(mockLaunchBrowser).toHaveBeenCalledTimes(1);
      const session2 = await sessionManager.getOrCreateSession(
        "issue-1",
        "chromium",
        true,
      );
      expect(mockCloseBrowser).toHaveBeenCalledTimes(1);
      expect(mockLaunchBrowser).toHaveBeenCalledTimes(2);
      expect(session1.id).not.toBe(session2.id);
    });

    it("does not recreate session when ignoreHTTPSErrors stays true", async () => {
      mockLaunchBrowser.mockResolvedValue(
        mockConn({ ignoreHTTPSErrors: true }),
      );
      const session1 = await sessionManager.getOrCreateSession(
        "issue-1",
        "chromium",
        true,
      );
      const session2 = await sessionManager.getOrCreateSession(
        "issue-1",
        "chromium",
        true,
      );
      expect(session1).toBe(session2);
      expect(mockLaunchBrowser).toHaveBeenCalledTimes(1);
    });
  });

  describe("closeSession", () => {
    it("does nothing when no session exists", async () => {
      await sessionManager.closeSession("issue-1");
      expect(mockHooks.emit).not.toHaveBeenCalled();
      expect(mockCloseBrowser).not.toHaveBeenCalled();
    });

    it("closes browser and removes session", async () => {
      const conn = mockConn();
      mockLaunchBrowser.mockResolvedValue(conn);
      mockCloseBrowser.mockResolvedValue(undefined);
      const session = await sessionManager.getOrCreateSession("issue-1");
      await sessionManager.closeSession("issue-1");
      expect(mockCloseBrowser).toHaveBeenCalledWith(conn);
      expect(sessionManager.hasActiveSession("issue-1")).toBe(false);
      expect(mockHooks.emit).toHaveBeenCalledWith("playwright:session.closed", {
        issueId: "issue-1",
        sessionId: session.id,
      });
    });
  });

  describe("closeAllSessions", () => {
    it("does nothing when no sessions exist", async () => {
      await sessionManager.closeAllSessions();
      expect(mockHooks.emit).not.toHaveBeenCalled();
    });

    it("closes all active sessions", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      mockCloseBrowser.mockResolvedValue(undefined);
      await sessionManager.getOrCreateSession("issue-1");
      await sessionManager.getOrCreateSession("issue-2");
      await sessionManager.closeAllSessions();
      expect(mockCloseBrowser).toHaveBeenCalledTimes(2);
      expect(sessionManager.hasActiveSession("issue-1")).toBe(false);
      expect(sessionManager.hasActiveSession("issue-2")).toBe(false);
    });
  });

  describe("getSessionState", () => {
    it("returns error when no session exists", () => {
      expect(sessionManager.getSessionState("issue-1")).toEqual({
        error: "No active session. Call navigate first.",
      });
    });

    it("returns error when page not navigated", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      mockHasNavigated.mockReturnValue(false);
      await sessionManager.getOrCreateSession("issue-1");
      expect(sessionManager.getSessionState("issue-1")).toEqual({
        error: "No page loaded. Call navigate with a URL.",
      });
    });

    it("returns session state when ready", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      mockHasNavigated.mockReturnValue(true);
      await sessionManager.getOrCreateSession("issue-1");
      const state = sessionManager.getSessionState("issue-1");
      expect("error" in state).toBe(false);
      expect("session" in state).toBe(true);
      expect("connection" in state).toBe(true);
    });
  });

  describe("navigate", () => {
    it("creates session and navigates", async () => {
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockResolvedValue({
        url: "https://example.com",
        title: "Example",
      });

      const result = await sessionManager.navigate(
        "issue-1",
        "https://example.com",
      );

      expect(result.success).toBe(true);
      expect(result.pageInfo).toEqual({
        url: "https://example.com",
        title: "Example",
        viewport: { width: 1280, height: 720 },
      });
    });

    it("emits page.loading and page.navigated events", async () => {
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockResolvedValue({
        url: "https://example.com",
        title: "Example",
      });

      await sessionManager.navigate("issue-1", "https://example.com");

      expect(mockHooks.emit).toHaveBeenCalledWith(
        "playwright:page.loading",
        expect.objectContaining({
          issueId: "issue-1",
          url: "https://example.com",
          initScripts: [],
        }),
      );
      expect(mockHooks.emit).toHaveBeenCalledWith(
        "playwright:page.navigated",
        expect.objectContaining({
          issueId: "issue-1",
          url: "https://example.com",
          title: "Example",
        }),
      );
    });

    it("adds init scripts from hook", async () => {
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockResolvedValue({
        url: "https://example.com",
        title: "Example",
      });

      // Simulate hook adding init script
      mockHooks.emit.mockImplementation((event, ctx) => {
        if (event === "playwright:page.loading") {
          ctx.initScripts.push("window.TEST = true;");
        }
      });

      await sessionManager.navigate("issue-1", "https://example.com");

      expect(mockAddInitScript).toHaveBeenCalledWith(
        mockConnection,
        "window.TEST = true;",
      );
    });

    it("handles navigation errors", async () => {
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockRejectedValue(new Error("Navigation timeout"));

      const result = await sessionManager.navigate(
        "issue-1",
        "https://example.com",
      );

      expect(result).toEqual({ success: false, error: "Navigation timeout" });
    });

    it("uses custom navigation options", async () => {
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockResolvedValue({
        url: "https://example.com",
        title: "Example",
      });

      await sessionManager.navigate("issue-1", "https://example.com", {
        waitUntil: "networkidle",
        timeout: 5000,
      });

      expect(mockNavigateTo).toHaveBeenCalledWith(
        mockConnection,
        "https://example.com",
        expect.objectContaining({
          waitUntil: "networkidle",
          timeout: 5000,
        }),
      );
    });

    it("sets extra HTTP headers before navigation", async () => {
      const mockSetExtraHTTPHeaders = vi.fn().mockResolvedValue(undefined);
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
        page: { setExtraHTTPHeaders: mockSetExtraHTTPHeaders },
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockResolvedValue({
        url: "https://example.com",
        title: "Example",
      });

      await sessionManager.navigate("issue-1", "https://example.com", {
        extraHTTPHeaders: {
          "User-Agent": "MyBot/1.0",
          Authorization: "Bearer token123",
        },
      });

      expect(mockSetExtraHTTPHeaders).toHaveBeenCalledWith({
        "User-Agent": "MyBot/1.0",
        Authorization: "Bearer token123",
      });
    });

    it("does not call setExtraHTTPHeaders when not provided", async () => {
      const mockSetExtraHTTPHeaders = vi.fn();
      const mockConnection = {
        config: { viewport: { width: 1280, height: 720 } },
        initScripts: [],
        extraHTTPHeaders: {},
        page: { setExtraHTTPHeaders: mockSetExtraHTTPHeaders },
      };
      mockLaunchBrowser.mockResolvedValue(mockConnection);
      mockNavigateTo.mockResolvedValue({
        url: "https://example.com",
        title: "Example",
      });

      await sessionManager.navigate("issue-1", "https://example.com");

      expect(mockSetExtraHTTPHeaders).not.toHaveBeenCalled();
    });
  });

  describe("setViewport", () => {
    it("returns error when no active session", async () => {
      const result = await sessionManager.setViewport("issue-1", {
        width: 1920,
        height: 1080,
      });
      expect(result).toEqual({
        success: false,
        error: "No active browser session",
      });
    });

    it("sets viewport and emits event", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      mockSetViewport.mockResolvedValue(undefined);
      await sessionManager.getOrCreateSession("issue-1");
      const result = await sessionManager.setViewport("issue-1", {
        width: 1920,
        height: 1080,
      });
      expect(result).toEqual({ success: true });
      expect(mockHooks.emit).toHaveBeenCalledWith(
        "playwright:viewport.changed",
        expect.objectContaining({
          issueId: "issue-1",
          viewport: { width: 1920, height: 1080 },
        }),
      );
    });
  });

  describe("getCurrentUrl", () => {
    it("returns null when no active session", () => {
      expect(sessionManager.getCurrentUrl("issue-1")).toBeNull();
    });

    it("returns current URL from connection", async () => {
      mockLaunchBrowser.mockResolvedValue(mockConn());
      mockGetCurrentUrl.mockReturnValue("https://example.com/page");
      await sessionManager.getOrCreateSession("issue-1");
      expect(sessionManager.getCurrentUrl("issue-1")).toBe(
        "https://example.com/page",
      );
    });
  });

  describe("getConsoleMessages", () => {
    it("returns empty array when no session exists", () => {
      expect(sessionManager.getConsoleMessages("issue-1")).toEqual([]);
    });

    it("returns console messages from connection", async () => {
      const messages = [{ type: "log", text: "Hello", timestamp: Date.now() }];
      mockLaunchBrowser.mockResolvedValue(
        mockConn({ consoleMessages: messages }),
      );
      await sessionManager.getOrCreateSession("issue-1");
      expect(sessionManager.getConsoleMessages("issue-1")).toBe(messages);
    });
  });

  describe("getNetworkRequests", () => {
    it("returns empty array when no session exists", () => {
      expect(sessionManager.getNetworkRequests("issue-1")).toEqual([]);
    });

    it("returns network requests from connection", async () => {
      const requests = [
        { url: "https://api.example.com", method: "GET", status: 200 },
      ];
      mockLaunchBrowser.mockResolvedValue(
        mockConn({ networkRequests: requests }),
      );
      await sessionManager.getOrCreateSession("issue-1");
      expect(sessionManager.getNetworkRequests("issue-1")).toBe(requests);
    });
  });
});
