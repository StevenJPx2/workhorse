import { createSignal, createMemo, For } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { AdapterInfo, Issue } from "@jiratown/core";
import { getTheme } from "../theme.ts";
import { useJiratownContext } from "../context/jiratown.tsx";

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

/** Modal for configuring and spawning an agent for an issue. */
export function SpawnModal(props: SpawnModalProps) {
  const theme = getTheme();
  const { orchestrator } = useJiratownContext();

  // Get registered harnesses from orchestrator
  const harnessOptions = createMemo<AdapterInfo[]>(() => {
    const adapters = orchestrator.getAdapterInfoList();
    // If no adapters registered, show a placeholder
    return adapters.length > 0
      ? adapters
      : [{ harness: "none", displayName: "No adapters", icon: "⚠️" }];
  });

  const [harnessIndex, setHarnessIndex] = createSignal(0);
  const [baseBranch, _setBaseBranch] = createSignal("main");
  const [focusedField, setFocusedField] = createSignal<"harness" | "branch">("harness");

  useKeyboard((key) => {
    if (key.name === "return") {
      const options = harnessOptions();
      const selectedHarness = options[harnessIndex()];
      if (selectedHarness && selectedHarness.harness !== "none") {
        props.onSpawn({
          issue: props.issue,
          harness: selectedHarness.harness,
          baseBranch: baseBranch(),
        });
      }
      return;
    }
    if (key.name === "tab") {
      setFocusedField((prev) => (prev === "harness" ? "branch" : "harness"));
      return;
    }
    if (focusedField() === "harness") {
      if (key.name === "up" || key.name === "k") {
        setHarnessIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === "down" || key.name === "j") {
        setHarnessIndex((prev) => Math.min(harnessOptions().length - 1, prev + 1));
      }
    }
  });

  return (
    // Full-screen overlay container - uses absolute positioning to cover parent
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={1000}
      justifyContent="center"
      alignItems="center"
    >
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
            <For each={harnessOptions()}>
              {(option, index) => (
                <box
                  backgroundColor={index() === harnessIndex() ? theme.colors.selection : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg={index() === harnessIndex() ? theme.colors.success : theme.colors.dim}>
                    {index() === harnessIndex() ? "● " : "○ "}
                    {option.icon} {option.displayName}
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
    </box>
  );
}
