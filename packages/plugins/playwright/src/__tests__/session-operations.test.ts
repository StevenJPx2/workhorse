/**
 * Tests for session-operations module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock browser-connection module
const mockTakeScreenshot = vi.fn();
const mockClickElement = vi.fn();
const mockFillField = vi.fn();
const mockGetElementInfo = vi.fn();
const mockGetPageContent = vi.fn();
const mockEvaluateScript = vi.fn();

vi.mock("../page-actions.ts", () => ({
  takeScreenshot: mockTakeScreenshot,
  clickElement: mockClickElement,
  fillField: mockFillField,
  getElementInfo: mockGetElementInfo,
  getPageContent: mockGetPageContent,
  evaluateScript: mockEvaluateScript,
}));

// Import after mocking
const { screenshot, click, fill, getElement, getContent, evaluate } =
  await import("../session-operations.ts");

// Create mock session manager
const createMockSessionManager = (
  sessionState:
    { error: string } | { session: { id: string }; connection: object },
) => ({
  getSessionState: vi.fn(() => sessionState),
  getDefaultTimeout: vi.fn(() => 30000),
  getHooks: vi.fn(() => ({ emit: vi.fn() })),
});

describe("session-operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("screenshot", () => {
    it("returns error when no active session", async () => {
      const manager = createMockSessionManager({ error: "No active session" });

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await screenshot(
        manager as any,
        "issue-1",
        "/tmp/shot.png",
      );

      expect(result).toEqual({ success: false, error: "No active session" });
      expect(mockTakeScreenshot).not.toHaveBeenCalled();
    });

    it("takes screenshot and returns path", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockTakeScreenshot.mockResolvedValue("/tmp/shot.png");

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await screenshot(
        manager as any,
        "issue-1",
        "/tmp/shot.png",
        {
          fullPage: true,
        },
      );

      expect(result).toEqual({ success: true, path: "/tmp/shot.png" });
      expect(mockTakeScreenshot).toHaveBeenCalledWith(
        mockConnection,
        "/tmp/shot.png",
        {
          fullPage: true,
          type: "png",
          quality: undefined,
        },
      );
    });

    it("converts jpeg format correctly", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockTakeScreenshot.mockResolvedValue("/tmp/shot.jpeg");

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      await screenshot(manager as any, "issue-1", "/tmp/shot.jpeg", {
        format: "jpeg",
        quality: 80,
      });

      expect(mockTakeScreenshot).toHaveBeenCalledWith(
        mockConnection,
        "/tmp/shot.jpeg",
        {
          fullPage: undefined,
          type: "jpeg",
          quality: 80,
        },
      );
    });

    it("emits screenshot.taken event", async () => {
      const mockEmit = vi.fn();
      const mockConnection = { page: {} };
      const manager = {
        getSessionState: vi.fn(() => ({
          session: { id: "session-1" },
          connection: mockConnection,
        })),
        getDefaultTimeout: vi.fn(() => 30000),
        getHooks: vi.fn(() => ({ emit: mockEmit })),
      };
      mockTakeScreenshot.mockResolvedValue("/tmp/shot.png");

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      await screenshot(manager as any, "issue-1", "/tmp/shot.png");

      expect(mockEmit).toHaveBeenCalledWith("playwright:screenshot.taken", {
        issueId: "issue-1",
        sessionId: "session-1",
        path: "/tmp/shot.png",
        options: {},
      });
    });

    it("handles errors gracefully", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockTakeScreenshot.mockRejectedValue(new Error("Screenshot failed"));

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await screenshot(
        manager as any,
        "issue-1",
        "/tmp/shot.png",
      );

      expect(result).toEqual({ success: false, error: "Screenshot failed" });
    });
  });

  describe("click", () => {
    it("returns error when no active session", async () => {
      const manager = createMockSessionManager({ error: "No page loaded" });

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await click(manager as any, "issue-1", "button");

      expect(result).toEqual({ success: false, error: "No page loaded" });
    });

    it("clicks element successfully", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockClickElement.mockResolvedValue(undefined);

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await click(manager as any, "issue-1", "button.submit");

      expect(result).toEqual({ success: true });
      expect(mockClickElement).toHaveBeenCalledWith(
        mockConnection,
        "button.submit",
        {
          timeout: 30000,
        },
      );
    });

    it("handles click errors", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockClickElement.mockRejectedValue(new Error("Element not found"));

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await click(manager as any, "issue-1", ".missing");

      expect(result).toEqual({ success: false, error: "Element not found" });
    });
  });

  describe("fill", () => {
    it("fills field successfully", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockFillField.mockResolvedValue(undefined);

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await fill(
        manager as any,
        "issue-1",
        "input[name=email]",
        "test@example.com",
      );

      expect(result).toEqual({ success: true });
      expect(mockFillField).toHaveBeenCalledWith(
        mockConnection,
        "input[name=email]",
        "test@example.com",
        { timeout: 30000 },
      );
    });
  });

  describe("getElement", () => {
    it("returns error when element not found", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockGetElementInfo.mockResolvedValue({ found: false });

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await getElement(manager as any, "issue-1", ".missing");

      expect(result).toEqual({
        success: false,
        error: "Element not found: .missing",
      });
    });

    it("returns element info when found", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockGetElementInfo.mockResolvedValue({
        found: true,
        tagName: "button",
        textContent: "Submit",
        boundingBox: { x: 10, y: 20, width: 100, height: 50 },
      });

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await getElement(manager as any, "issue-1", "button");

      expect(result.success).toBe(true);
      expect(result.element).toEqual({
        found: true,
        tagName: "button",
        textContent: "Submit",
        boundingBox: { x: 10, y: 20, width: 100, height: 50 },
      });
    });
  });

  describe("getContent", () => {
    it("returns page content", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockGetPageContent.mockResolvedValue("<html><body>Hello</body></html>");

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await getContent(manager as any, "issue-1");

      expect(result).toEqual({
        success: true,
        content: "<html><body>Hello</body></html>",
      });
    });
  });

  describe("evaluate", () => {
    it("evaluates expression and returns result", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockEvaluateScript.mockResolvedValue({ count: 42 });

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await evaluate(
        manager as any,
        "issue-1",
        "return { count: 42 }",
      );

      expect(result).toEqual({ success: true, result: { count: 42 } });
      expect(mockEvaluateScript).toHaveBeenCalledWith(
        mockConnection,
        "return { count: 42 }",
      );
    });

    it("handles evaluation errors", async () => {
      const mockConnection = { page: {} };
      const manager = createMockSessionManager({
        session: { id: "session-1" },
        connection: mockConnection,
      });
      mockEvaluateScript.mockRejectedValue(new Error("Syntax error"));

      // biome-ignore lint/suspicious/noExplicitAny: Test mock
      const result = await evaluate(
        manager as any,
        "issue-1",
        "invalid syntax {{{",
      );

      expect(result).toEqual({ success: false, error: "Syntax error" });
    });
  });
});
