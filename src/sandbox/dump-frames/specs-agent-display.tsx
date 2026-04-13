/**
 * Frame specs for AgentDisplay component
 *
 * Shows different states of the agent display with LLM summaries
 */

import { createSignal } from "solid-js";
import { AgentDisplay } from "../../components/ticket-pane/agent-display.tsx";
import type { AgentProgressInfo } from "../../hooks/use-agent-progress/index.ts";
import type { AgentStep } from "../../hooks/use-agent-summary/index.ts";
import type { FrameSpec } from "./types.ts";

// Helper to create mock progress info
function mockProgress(overrides: Partial<AgentProgressInfo> = {}): AgentProgressInfo {
  return {
    state: "idle",
    stateLabel: "Idle",
    stateIndicator: "○",
    stateColor: "#888888",
    startedAt: null,
    runningDuration: null,
    summary: null,
    recentActivity: [],
    keyDecisions: [],
    hasSessionMemory: false,
    ...overrides,
  };
}

// Helper to create mock steps
function mockSteps(items: Array<{ desc: string; type: AgentStep["type"] }>): AgentStep[] {
  return items.map((item, i) => ({
    description: item.desc,
    type: item.type,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
  }));
}

export const agentDisplaySpecs: FrameSpec[] = [
  {
    name: "agent-display-idle",
    options: { width: 80, height: 14 },
    component: () => {
      const [progress] = createSignal(mockProgress());
      const [steps] = createSignal<AgentStep[]>([]);
      const [status] = createSignal<string | null>(null);
      const [polling] = createSignal(false);
      const [error] = createSignal<string | null>(null);

      return (
        <AgentDisplay
          progress={progress}
          steps={steps}
          currentStatus={status}
          isPolling={polling}
          error={error}
          maxSteps={6}
        />
      );
    },
  },
  {
    name: "agent-display-running",
    options: { width: 80, height: 16 },
    component: () => {
      const [progress] = createSignal(
        mockProgress({
          state: "running",
          stateLabel: "Running",
          stateIndicator: "●",
          stateColor: "#7aa2f7",
          runningDuration: "2m 30s",
        }),
      );
      const [steps] = createSignal(
        mockSteps([
          { desc: "Reading button component", type: "thinking" },
          { desc: "Creating CSS module file", type: "action" },
          { desc: "Writing button styles", type: "action" },
        ]),
      );
      const [status] = createSignal("Writing button styles");
      const [polling] = createSignal(true);
      const [error] = createSignal<string | null>(null);

      return (
        <AgentDisplay
          progress={progress}
          steps={steps}
          currentStatus={status}
          isPolling={polling}
          error={error}
          maxSteps={6}
          onStop={() => {}}
        />
      );
    },
  },
  {
    name: "agent-display-completed",
    options: { width: 80, height: 16 },
    component: () => {
      const [progress] = createSignal(
        mockProgress({
          state: "stopped",
          stateLabel: "Stopped",
          stateIndicator: "■",
          stateColor: "#ff9e64",
        }),
      );
      const [steps] = createSignal(
        mockSteps([
          { desc: "Analyzed code structure", type: "thinking" },
          { desc: "Created button.module.css", type: "action" },
          { desc: "Updated button.tsx imports", type: "action" },
          { desc: "All tests passed", type: "result" },
        ]),
      );
      const [status] = createSignal("Task completed");
      const [polling] = createSignal(false);
      const [error] = createSignal<string | null>(null);

      return (
        <AgentDisplay
          progress={progress}
          steps={steps}
          currentStatus={status}
          isPolling={polling}
          error={error}
          maxSteps={6}
        />
      );
    },
  },
  {
    name: "agent-display-error",
    options: { width: 80, height: 14 },
    component: () => {
      const [progress] = createSignal(
        mockProgress({
          state: "running",
          stateLabel: "Running",
          stateIndicator: "●",
          stateColor: "#7aa2f7",
        }),
      );
      const [steps] = createSignal<AgentStep[]>([]);
      const [status] = createSignal<string | null>(null);
      const [polling] = createSignal(true);
      const [error] = createSignal("Ollama not available");

      return (
        <AgentDisplay
          progress={progress}
          steps={steps}
          currentStatus={status}
          isPolling={polling}
          error={error}
          maxSteps={6}
          onStop={() => {}}
        />
      );
    },
  },
];
