/**
 * Log suppression tests for AtlassianClient
 *
 * Verifies that MCP remote debug logs don't leak into the terminal UI.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createAtlassianClient } from "../client.ts";

// Capture spawn arguments to verify log redirection
let capturedCommand: string | null = null;
let capturedArgs: string[] | null = null;

const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockCallTool = mock(() =>
  Promise.resolve({
    content: [{ type: "text", text: "{}" }],
  }),
);

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    callTool = mockCallTool;
  },
}));

mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class MockTransport {
    constructor(options: { command: string; args: string[] }) {
      capturedCommand = options.command;
      capturedArgs = options.args;
    }
  },
}));

describe("AtlassianClient log suppression", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockCallTool.mockClear();
    capturedCommand = null;
    capturedArgs = null;
  });

  describe("shell command wrapping", () => {
    it("should use shell on macOS/Linux with stderr redirect", async () => {
      // Mock process.platform
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      createAtlassianClient({ cloudId: "test.atlassian.net" });

      // Trigger connection
      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      expect(capturedCommand).toBe("sh");
      expect(capturedArgs).toHaveLength(2);
      expect(capturedArgs![0]).toBe("-c");
      // Verify stderr is redirected to /dev/null
      expect(capturedArgs![1]).toContain("2>/dev/null");
      expect(capturedArgs![1]).toContain("mcp-remote");
      expect(capturedArgs![1]).toContain("https://mcp.atlassian.com/v1/mcp");
    });

    it("should use cmd on Windows with stderr redirect", async () => {
      // Mock process.platform
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      expect(capturedCommand).toBe("cmd");
      expect(capturedArgs).toHaveLength(2);
      expect(capturedArgs![0]).toBe("/c");
      // Verify stderr is redirected to nul
      expect(capturedArgs![1]).toContain("2>nul");
      expect(capturedArgs![1]).toContain("mcp-remote");
    });

    it("should use sh on Linux with stderr redirect", async () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      expect(capturedCommand).toBe("sh");
      expect(capturedArgs![0]).toBe("-c");
      expect(capturedArgs![1]).toContain("2>/dev/null");
    });
  });

  describe("log output prevention", () => {
    it("should not include direct npx command that outputs logs", async () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      // The command should NOT be npx directly (which would output logs)
      expect(capturedCommand).not.toBe("npx");
      // Should be wrapped in shell
      expect(capturedCommand).toBe("sh");
    });

    it("should wrap command to capture all output", async () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      const client = createAtlassianClient({ cloudId: "test.atlassian.net" });
      await client.connect();

      // The shell command should include the full npx command
      const fullCommand = capturedArgs![1];

      // Verify key components are present
      expect(fullCommand).toContain("npx");
      expect(fullCommand).toContain("-y");
      expect(fullCommand).toContain("mcp-remote");
      expect(fullCommand).toContain("https://mcp.atlassian.com/v1/mcp");

      // Most importantly - verify stderr redirect is present
      expect(fullCommand).toMatch(/2>\/(dev\/)?null|2>nul/);
    });
  });
});
