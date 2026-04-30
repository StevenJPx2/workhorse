import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { AgentAdapter } from "@jiratown/core";
import { useJiratownContext } from "../context/jiratown.tsx";

/**
 * Reactive primitive that tracks all running agents.
 * Automatically refreshes when agents are created, stopped, or become idle.
 */
export function createAgents(): Accessor<AgentAdapter[]> {
  const { orchestrator, hooks } = useJiratownContext();
  const [agents, setAgents] = createSignal<AgentAdapter[]>(orchestrator.getAll());

  onMount(() => {
    const refresh = () => setAgents(orchestrator.getAll());

    hooks.on("agent.create.post", refresh);
    hooks.on("agent.stop.post", refresh);
    hooks.on("agent.idle", refresh);

    onCleanup(() => {
      hooks.off("agent.create.post", refresh);
      hooks.off("agent.stop.post", refresh);
      hooks.off("agent.idle", refresh);
    });
  });

  return agents;
}
