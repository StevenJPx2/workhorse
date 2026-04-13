/**
 * Tests for useAgent hook
 */

import { describe, test, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useAgent } from "./use-agent.ts";

describe("useAgent", () => {
  describe("initial state", () => {
    test("starts with empty agents map", () => {
      createRoot((dispose) => {
        const agent = useAgent({ repoPath: "/test/repo" });

        expect(agent.agents()).toBeInstanceOf(Map);
        expect(agent.agents().size).toBe(0);
        expect(agent.isLoading()).toBe(false);
        expect(agent.error()).toBeNull();

        dispose();
      });
    });
  });

  describe("interface", () => {
    test("exposes all required methods", () => {
      createRoot((dispose) => {
        const agent = useAgent({ repoPath: "/test/repo" });

        expect(typeof agent.spawn).toBe("function");
        expect(typeof agent.stop).toBe("function");
        expect(typeof agent.get).toBe("function");
        expect(typeof agent.isRunning).toBe("function");
        expect(typeof agent.getState).toBe("function");
        expect(typeof agent.sendMessage).toBe("function");
        expect(typeof agent.captureOutput).toBe("function");
        expect(typeof agent.checkHealth).toBe("function");
        expect(typeof agent.getRunning).toBe("function");
        expect(typeof agent.reload).toBe("function");

        dispose();
      });
    });

    test("exposes reactive accessors", () => {
      createRoot((dispose) => {
        const agent = useAgent({ repoPath: "/test/repo" });

        expect(typeof agent.agents).toBe("function");
        expect(typeof agent.isLoading).toBe("function");
        expect(typeof agent.error).toBe("function");

        dispose();
      });
    });
  });

  describe("options", () => {
    test("accepts repoPath option", () => {
      createRoot((dispose) => {
        const agent = useAgent({ repoPath: "/test/repo" });
        expect(agent).toBeDefined();

        dispose();
      });
    });

    test("accepts jiraCloudId option", () => {
      createRoot((dispose) => {
        const agent = useAgent({
          repoPath: "/test/repo",
          jiraCloudId: "company.atlassian.net",
        });
        expect(agent).toBeDefined();

        dispose();
      });
    });

    test("accepts autoLoad option", () => {
      createRoot((dispose) => {
        const agent = useAgent({
          repoPath: "/test/repo",
          autoLoad: true,
        });
        expect(agent).toBeDefined();

        dispose();
      });
    });

    test("accepts healthCheckInterval option", () => {
      createRoot((dispose) => {
        const agent = useAgent({
          repoPath: "/test/repo",
          healthCheckInterval: 5000,
        });
        expect(agent).toBeDefined();

        dispose();
      });
    });

    test("accepts onStateChange callback", () => {
      const onStateChange = mock(() => {});

      createRoot((dispose) => {
        const agent = useAgent({
          repoPath: "/test/repo",
          onStateChange,
        });
        expect(agent).toBeDefined();

        dispose();
      });
    });

    test("accepts onError callback", () => {
      const onError = mock(() => {});

      createRoot((dispose) => {
        const agent = useAgent({
          repoPath: "/test/repo",
          onError,
        });
        expect(agent).toBeDefined();

        dispose();
      });
    });
  });

  describe("get and isRunning", () => {
    test("returns undefined for unknown ticket", () => {
      createRoot((dispose) => {
        const agent = useAgent({ repoPath: "/test/repo" });

        expect(agent.get("UNKNOWN-123")).toBeUndefined();
        expect(agent.isRunning("UNKNOWN-123")).toBe(false);
        expect(agent.getState("UNKNOWN-123")).toBeUndefined();

        dispose();
      });
    });
  });

  describe("getRunning", () => {
    test("returns empty array when no agents running", () => {
      createRoot((dispose) => {
        const agent = useAgent({ repoPath: "/test/repo" });

        expect(agent.getRunning()).toEqual([]);

        dispose();
      });
    });
  });

  describe("error handling", () => {
    test("throws if repoPath not provided on spawn", async () => {
      await createRoot(async (dispose) => {
        const agent = useAgent({
          onError: () => {},
        });

        const result = await agent.spawn({
          ticketId: "AM-123",
          agentType: "opencode",
        });

        expect(result).toBeNull();
        expect(agent.error()).not.toBeNull();
        expect(agent.error()?.message).toContain("repoPath is required");

        dispose();
      });
    });
  });
});
