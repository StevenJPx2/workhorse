import { createSignal } from "solid-js";
import { Portal, useRenderer } from "@opentui/solid";
import type { Issue } from "@jiratown/core";
import { theme } from "../theme.ts";

interface SpawnModalProps {
  issue: Issue;
  onSpawn: (config: SpawnConfig) => void;
  onClose: () => void;
}

export interface SpawnConfig {
  issue: Issue;
  harness: string;
  baseBranch: string;
}

/**
 * Modal for configuring and spawning an agent for an issue.
 */
export function SpawnModal(props: SpawnModalProps) {
  // Renderer is available via useRenderer() if needed for focus handling
  const _renderer = useRenderer();
  const [_harness, setHarness] = createSignal("pi");
  const [baseBranch, setBaseBranch] = createSignal("main");

  const harnessSelectProps = {
    options: [
      { name: "Pi Coding Agent", description: "Default agent", value: "pi" },
      { name: "Claude Code", description: "Claude agent", value: "claude-code" },
    ],
    onItemSelected: (_: number, opt: { value: string }) => setHarness(opt.value),
  };

  return (
    <Portal mount={_renderer.root}>
      <box
        flexDirection="column"
        borderStyle="rounded"
        title="Spawn Agent"
        padding={1}
        width={45}
        backgroundColor={theme.colors.background}
      >
        <text>
          <b>Issue:</b> {props.issue.externalId || props.issue.id} — {props.issue.title}
        </text>

        <box marginTop={1}>
          <text>Harness:</text>
          <select {...(harnessSelectProps as any)} />
        </box>

        <box marginTop={1}>
          <text>Base branch:</text>
          <input value={baseBranch()} onInput={(e) => setBaseBranch(e)} />
        </box>

        <box flexDirection="row" gap={2} marginTop={2}>
          <text>
            <b>[Enter]</b> Spawn
          </text>
          <text>
            <b>[ESC]</b> Cancel
          </text>
        </box>
      </box>
    </Portal>
  );
}
