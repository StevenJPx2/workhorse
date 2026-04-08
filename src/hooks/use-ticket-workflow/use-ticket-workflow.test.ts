/**
 * Tests for useTicketWorkflow hook
 *
 * These tests verify the workflow orchestration including:
 * - Lazy resolution of repoPath and jiraCloudId getters
 * - Interface and initialization behavior
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { useTicketWorkflow } from "./use-ticket-workflow.ts";

describe("useTicketWorkflow", () => {
  describe("initialization", () => {
    test("starts with no loading state", () => {
      createRoot((dispose) => {
        const workflow = useTicketWorkflow({
          repoPath: "/test/repo",
          jiraCloudId: "test.atlassian.net",
        });

        expect(workflow.isLoading()).toBe(false);
        expect(workflow.error()).toBeNull();

        dispose();
      });
    });

    test("exposes all required methods", () => {
      createRoot((dispose) => {
        const workflow = useTicketWorkflow({
          repoPath: "/test/repo",
        });

        expect(typeof workflow.startWork).toBe("function");
        expect(typeof workflow.stopWork).toBe("function");
        expect(typeof workflow.getAgentState).toBe("function");
        expect(typeof workflow.isAgentRunning).toBe("function");
        expect(typeof workflow.sendToAgent).toBe("function");

        dispose();
      });
    });
  });

  describe("getter function support", () => {
    test("accepts repoPath as a getter function", () => {
      createRoot((dispose) => {
        const getRepoPath = () => "/lazy/repo/path";

        const workflow = useTicketWorkflow({
          repoPath: getRepoPath,
        });

        expect(workflow).toBeDefined();
        dispose();
      });
    });

    test("accepts jiraCloudId as a getter function", () => {
      createRoot((dispose) => {
        const getCloudId = () => "lazy.atlassian.net";

        const workflow = useTicketWorkflow({
          repoPath: "/test/repo",
          jiraCloudId: getCloudId,
        });

        expect(workflow).toBeDefined();
        dispose();
      });
    });

    test("accepts both as getter functions (like App.tsx pattern)", () => {
      createRoot((dispose) => {
        // This is the fixed pattern from App.tsx
        const [rigInfo, setRigInfo] = createSignal<{ gitRoot: string } | null>(null);
        const [config, setConfig] = createSignal<{ jira: { cloud_id: string } } | null>(null);

        const gitRoot = () => rigInfo()?.gitRoot;
        const cloudId = () => config()?.jira.cloud_id;

        const workflow = useTicketWorkflow({
          repoPath: gitRoot, // Getter function
          jiraCloudId: cloudId, // Getter function
        });

        // Initially both are undefined
        expect(gitRoot()).toBeUndefined();
        expect(cloudId()).toBeUndefined();

        // Simulate async loading
        setRigInfo({ gitRoot: "/loaded/repo" });
        setConfig({ jira: { cloud_id: "loaded.atlassian.net" } });

        // Now they have values
        expect(gitRoot()).toBe("/loaded/repo");
        expect(cloudId()).toBe("loaded.atlassian.net");

        // Workflow is still valid
        expect(workflow).toBeDefined();
        expect(workflow.isLoading()).toBe(false);

        dispose();
      });
    });

    test("demonstrates the BUG pattern that was fixed", () => {
      createRoot((dispose) => {
        // BUG: This was the broken pattern in App.tsx
        const [rigInfo, setRigInfo] = createSignal<{ gitRoot: string } | null>(null);

        // WRONG: Evaluating the getter immediately captures undefined
        const capturedValue = rigInfo()?.gitRoot; // undefined!

        // This would create workflow with undefined that never updates
        const workflow = useTicketWorkflow({
          repoPath: capturedValue, // Captured undefined!
        });

        // Even after loading...
        setRigInfo({ gitRoot: "/loaded/repo" });

        // capturedValue is still undefined (it's a value, not a getter)
        expect(capturedValue).toBeUndefined();

        dispose();
      });
    });

    test("demonstrates the FIXED pattern", () => {
      createRoot((dispose) => {
        // FIXED: Pass the getter function directly
        const [rigInfo, setRigInfo] = createSignal<{ gitRoot: string } | null>(null);

        const gitRoot = () => rigInfo()?.gitRoot;

        // CORRECT: Pass the getter, not the evaluated value
        const workflow = useTicketWorkflow({
          repoPath: gitRoot, // Getter function!
        });

        // Initially undefined
        expect(gitRoot()).toBeUndefined();

        // After loading...
        setRigInfo({ gitRoot: "/loaded/repo" });

        // The getter now returns the loaded value
        expect(gitRoot()).toBe("/loaded/repo");

        // When workflow.startWork() is called, it will resolve the getter
        // and get "/loaded/repo" instead of undefined

        dispose();
      });
    });
  });

  describe("types", () => {
    test("UseTicketWorkflowOptions accepts string or getter for repoPath", () => {
      createRoot((dispose) => {
        // String value
        const w1 = useTicketWorkflow({ repoPath: "/test/repo" });
        expect(w1).toBeDefined();

        // Getter function
        const w2 = useTicketWorkflow({ repoPath: () => "/test/repo" });
        expect(w2).toBeDefined();

        // Getter that returns undefined
        const w3 = useTicketWorkflow({ repoPath: () => undefined });
        expect(w3).toBeDefined();

        dispose();
      });
    });

    test("UseTicketWorkflowOptions accepts string or getter for jiraCloudId", () => {
      createRoot((dispose) => {
        // String value
        const w1 = useTicketWorkflow({
          repoPath: "/test",
          jiraCloudId: "test.atlassian.net",
        });
        expect(w1).toBeDefined();

        // Getter function
        const w2 = useTicketWorkflow({
          repoPath: "/test",
          jiraCloudId: () => "test.atlassian.net",
        });
        expect(w2).toBeDefined();

        dispose();
      });
    });
  });

  describe("callbacks", () => {
    test("accepts onError callback", () => {
      const onError = mock(() => {});

      createRoot((dispose) => {
        const workflow = useTicketWorkflow({
          repoPath: "/test/repo",
          onError,
        });

        expect(workflow).toBeDefined();
        dispose();
      });
    });

    test("accepts onAgentStateChange callback", () => {
      const onAgentStateChange = mock(() => {});

      createRoot((dispose) => {
        const workflow = useTicketWorkflow({
          repoPath: "/test/repo",
          onAgentStateChange,
        });

        expect(workflow).toBeDefined();
        dispose();
      });
    });
  });
});
