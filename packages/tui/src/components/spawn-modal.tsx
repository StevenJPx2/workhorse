import { createSignal, For } from "solid-js";
import { Portal, useRenderer } from "@opentui/solid";
import type { Issue } from "@jiratown/core";
import { getTheme } from "../theme.ts";

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

const HARNESS_OPTIONS = [
  { name: "Pi Coding Agent", value: "pi", icon: "🤖" },
  { name: "Claude Code", value: "claude-code", icon: "🧠" },
];

/**
 * Modal for configuring and spawning an agent for an issue.
 * Uses background colors for visual depth.
 */
export function SpawnModal(props: SpawnModalProps) {
  const renderer = useRenderer();
  const theme = getTheme();
  const [harnessIndex, _setHarnessIndex] = createSignal(0);
  const [baseBranch, _setBaseBranch] = createSignal("main");
  const [focusedField, _setFocusedField] = createSignal<"harness" | "branch">("harness");

  return (
    <Portal mount={renderer.root}>
      <box
        flexDirection="column"
        width={50}
        backgroundColor={theme.colors.surface}
        borderStyle="rounded"
        borderColor={theme.colors.accent}
      >
        {/* Header */}
        <box
          backgroundColor={theme.colors.selection}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.colors.accent}>
            <b>🚀 SPAWN AGENT</b>
          </text>
        </box>

        {/* Issue info */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <text fg={theme.colors.dim}>Issue: </text>
          <text fg={theme.colors.info}>
            <b>{props.issue.externalId || props.issue.id}</b>
          </text>
        </box>
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <text fg={theme.colors.text}>{props.issue.title}</text>
        </box>

        {/* Harness selection */}
        <box
          backgroundColor={focusedField() === "harness" ? theme.colors.background : undefined}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <box marginBottom={1}>
            <text fg={focusedField() === "harness" ? theme.colors.accent : theme.colors.dim}>
              {focusedField() === "harness" ? "▸ " : "  "}
              <b>Agent Harness</b>
            </text>
          </box>
          <box flexDirection="column" paddingLeft={4}>
            <For each={HARNESS_OPTIONS}>
              {(option, index) => (
                <box
                  backgroundColor={index() === harnessIndex() ? theme.colors.selection : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg={index() === harnessIndex() ? theme.colors.success : theme.colors.dim}>
                    {index() === harnessIndex() ? "● " : "○ "}
                    {option.icon} {option.name}
                  </text>
                </box>
              )}
            </For>
          </box>
        </box>

        {/* Base branch */}
        <box
          backgroundColor={focusedField() === "branch" ? theme.colors.background : undefined}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <box marginBottom={1}>
            <text fg={focusedField() === "branch" ? theme.colors.accent : theme.colors.dim}>
              {focusedField() === "branch" ? "▸ " : "  "}
              <b>Base Branch</b>
            </text>
          </box>
          <box paddingLeft={4}>
            <box backgroundColor={theme.colors.selection} paddingLeft={1} paddingRight={1}>
              <text fg={theme.colors.info}>{baseBranch()}</text>
            </box>
          </box>
        </box>

        {/* Actions */}
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          gap={3}
        >
          <box>
            <text fg={theme.colors.success}>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}> spawn</text>
          </box>
          <box>
            <text fg={theme.colors.warning}>
              <b>ESC</b>
            </text>
            <text fg={theme.colors.dim}> cancel</text>
          </box>
          <box>
            <text fg={theme.colors.accent}>
              <b>Tab</b>
            </text>
            <text fg={theme.colors.dim}> switch field</text>
          </box>
        </box>
      </box>
    </Portal>
  );
}
