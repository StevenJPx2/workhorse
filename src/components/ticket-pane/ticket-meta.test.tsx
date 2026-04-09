/**
 * Tests for TicketMeta component - particularly the reactive agentState pattern
 */

import { describe, test, expect } from "bun:test";
import { createSignal } from "solid-js";
import type { AgentState } from "../../harness/orchestrator/types.ts";
import type { TicketMetaProps } from "./types.ts";

describe("TicketMeta agentState prop", () => {
  describe("Type compatibility", () => {
    test("accepts AgentState value directly", () => {
      const props: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: "running",
        worktreePath: "/path/to/worktree",
        branchName: "feat/test",
      };

      expect(props.agentState).toBe("running");
    });

    test("accepts AgentState accessor function", () => {
      const [state, setState] = createSignal<AgentState>("idle");

      const props: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: state, // Passing the accessor directly
        worktreePath: "/path/to/worktree",
        branchName: "feat/test",
      };

      // Should be a function
      expect(typeof props.agentState).toBe("function");

      // Calling it should return the state
      const accessor = props.agentState as () => AgentState | undefined;
      expect(accessor()).toBe("idle");

      // Updating should reflect new value
      setState("running");
      expect(accessor()).toBe("running");
    });

    test("accepts undefined agentState", () => {
      const props: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: undefined,
        worktreePath: null,
        branchName: null,
      };

      expect(props.agentState).toBeUndefined();
    });

    test("accepts accessor that returns undefined", () => {
      const [state] = createSignal<AgentState | undefined>(undefined);

      const props: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: state,
        worktreePath: null,
        branchName: null,
      };

      const accessor = props.agentState as () => AgentState | undefined;
      expect(accessor()).toBeUndefined();
    });
  });

  describe("Resolver pattern", () => {
    test("resolves value type correctly", () => {
      const resolveAgentState = (
        agentState: AgentState | (() => AgentState | undefined) | undefined
      ): AgentState | undefined => {
        return typeof agentState === "function" ? agentState() : agentState;
      };

      // Direct value
      expect(resolveAgentState("running")).toBe("running");
      expect(resolveAgentState("idle")).toBe("idle");
      expect(resolveAgentState("crashed")).toBe("crashed");
      expect(resolveAgentState(undefined)).toBeUndefined();
    });

    test("resolves accessor type correctly", () => {
      const resolveAgentState = (
        agentState: AgentState | (() => AgentState | undefined) | undefined
      ): AgentState | undefined => {
        return typeof agentState === "function" ? agentState() : agentState;
      };

      const [state, setState] = createSignal<AgentState>("starting");

      // Initial value
      expect(resolveAgentState(state)).toBe("starting");

      // After update
      setState("running");
      expect(resolveAgentState(state)).toBe("running");

      setState("stopped");
      expect(resolveAgentState(state)).toBe("stopped");
    });

    test("handles mixed usage in props", () => {
      const resolveAgentState = (
        agentState: AgentState | (() => AgentState | undefined) | undefined
      ): AgentState | undefined => {
        return typeof agentState === "function" ? agentState() : agentState;
      };

      // Simulating different tickets with different prop styles
      const staticProps: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: "running",
        worktreePath: null,
        branchName: null,
      };

      const [dynamicState] = createSignal<AgentState>("idle");
      const dynamicProps: TicketMetaProps = {
        status: "implementing",
        agent: "claude",
        agentState: dynamicState,
        worktreePath: "/path",
        branchName: "main",
      };

      expect(resolveAgentState(staticProps.agentState)).toBe("running");
      expect(resolveAgentState(dynamicProps.agentState)).toBe("idle");
    });
  });

  describe("All AgentState values", () => {
    const allStates: AgentState[] = [
      "idle",
      "starting",
      "running",
      "stopping",
      "stopped",
      "crashed",
    ];

    test.each(allStates)("accepts %s as direct value", (state) => {
      const props: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: state,
        worktreePath: null,
        branchName: null,
      };

      expect(props.agentState).toBe(state);
    });

    test.each(allStates)("accepts %s via accessor", (state) => {
      const [signal] = createSignal<AgentState>(state);

      const props: TicketMetaProps = {
        status: "planning",
        agent: "opencode",
        agentState: signal,
        worktreePath: null,
        branchName: null,
      };

      const accessor = props.agentState as () => AgentState;
      expect(accessor()).toBe(state);
    });
  });
});

describe("TicketPaneProps agentState", () => {
  test("type allows accessor pattern", () => {
    const [state] = createSignal<AgentState>("running");

    // This should compile without errors
    const agentStateAccessor: AgentState | (() => AgentState | undefined) = state;

    expect(typeof agentStateAccessor).toBe("function");
  });
});
