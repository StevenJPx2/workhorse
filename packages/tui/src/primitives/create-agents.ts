import { createSignal, createMemo, onMount, onCleanup, type Accessor } from "solid-js";
import type { AgentAdapter, AgentState } from "@jiratown/core";
import { useJiratownContext } from "../context/jiratown.tsx";

/**
 * Reactive primitive that tracks all agents and their states.
 * Returns both the agent list and a helper to get reactive state for any agent.
 */
export function createAgents(): {
  agents: Accessor<AgentAdapter[]>;
  getState: (issueId: string | null) => AgentState | null;
} {
  const { orchestrator, hooks } = useJiratownContext();

  // Version counter to force re-computation on state changes
  const [version, setVersion] = createSignal(0);
  const bump = () => setVersion((v) => v + 1);

  onMount(() => {
    hooks.on("agent.create.post", bump);
    hooks.on("agent.start.pre", bump);
    hooks.on("agent.start.post", bump);
    hooks.on("agent.stop.pre", bump);
    hooks.on("agent.stop.post", bump);
    hooks.on("agent.idle", bump);

    onCleanup(() => {
      hooks.off("agent.create.post", bump);
      hooks.off("agent.start.pre", bump);
      hooks.off("agent.start.post", bump);
      hooks.off("agent.stop.pre", bump);
      hooks.off("agent.stop.post", bump);
      hooks.off("agent.idle", bump);
    });
  });

  // Memo that depends on version - re-computes when bumped
  const agents = createMemo(() => {
    version(); // Subscribe to version changes
    return orchestrator.getAll();
  });

  // Helper to get state reactively (depends on version)
  const getState = (issueId: string | null): AgentState | null => {
    if (!issueId) return null;
    version(); // Subscribe to version changes
    return orchestrator.getAgent(issueId)?.state ?? null;
  };

  return { agents, getState };
}
