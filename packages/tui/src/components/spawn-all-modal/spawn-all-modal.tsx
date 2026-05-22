import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { For, createMemo, createSignal } from "solid-js";
import type { AdapterInfo } from "workhorse-core";

import { useWorkhorseContext } from "../../context/workhorse.tsx";
import { ui } from "../../state/ui";
import { getTheme } from "../../theme.ts";
import { HarnessList } from "../spawn-modal/harness-list.tsx";
import { ModalFooter } from "../spawn-modal/modal-footer.tsx";
import type { SpawnAllModalProps } from "./types.ts";

/** Modal for spawning agents for multiple issues at once. */
export function SpawnAllModal(props: SpawnAllModalProps) {
  const theme = getTheme();
  const { orchestrator } = useWorkhorseContext();
  const dimensions = useTerminalDimensions();

  const harnessOptions = createMemo<AdapterInfo[]>(() => {
    const adapters = orchestrator.getAdapterInfoList();
    return adapters.length > 0
      ? adapters
      : [{ harness: "none", displayName: "No adapters", icon: "⚠️" }];
  });

  const [harnessIndex, setHarnessIndex] = createSignal(0);
  const [baseBranch, _setBaseBranch] = createSignal("main");
  const [focusedField, setFocusedField] = createSignal<"harness" | "branch">(
    "harness",
  );

  const modalHeight = () =>
    Math.min(20, Math.floor(dimensions().height * 0.8) + 40);
  const harnessListHeight = () => Math.max(1, harnessOptions().length);
  const issueCount = () => props.issues.length;

  // oxlint-disable-next-line workhorse/no-single-use-variable -- used in useKeyboard and JSX onConfirm
  const handleConfirm = () => {
    const selectedHarness = harnessOptions()[harnessIndex()];
    if (selectedHarness && selectedHarness.harness !== "none") {
      props.onSpawn({
        issues: props.issues,
        harness: selectedHarness.harness,
        baseBranch: baseBranch(),
      });
    } else {
      props.onClose();
    }
  };

  // oxlint-disable-next-line workhorse/no-single-use-variable -- used in useKeyboard and JSX onToggle
  const toggleField = () => {
    setFocusedField((p) => (p === "harness" ? "branch" : "harness"));
  };

  useKeyboard((key) => {
    if (ui.modal() !== "spawn-all") return;
    if (key.name === "return") {
      handleConfirm();
      return;
    }
    if (key.name === "tab") {
      toggleField();
      return;
    }
    if (focusedField() === "harness") {
      if (key.name === "up" || key.name === "k") {
        setHarnessIndex((p) => Math.max(0, p - 1));
        return;
      }
      if (key.name === "down" || key.name === "j") {
        setHarnessIndex((p) => Math.min(harnessOptions().length - 1, p + 1));
      }
    }
  });

  const isHarnessFocused = () => focusedField() === "harness";
  const fieldLabel = (field: "harness" | "branch") =>
    focusedField() === field ? "▸ " : "  ";
  const fieldColor = (field: "harness" | "branch") =>
    focusedField() === field ? theme.colors.accent : theme.colors.dim;

  return (
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
        width={56}
        height={modalHeight()}
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
          width="100%"
        >
          <text fg={theme.colors.accent}>
            <b>🚀 SPAWN ALL AGENTS</b>
          </text>
        </box>

        {/* Issue count and list */}
        <box paddingX={2} paddingTop={1} flexDirection="column" gap={1}>
          <text fg={theme.colors.info}>
            <b>{issueCount()} issues</b>
          </text>
          <box flexDirection="column" height={Math.min(3, issueCount())}>
            <For each={props.issues.slice(0, 3)}>
              {(issue) => (
                <text fg={theme.colors.dim}>
                  • {issue.externalId || issue.id}
                </text>
              )}
            </For>
            {issueCount() > 3 && (
              <text fg={theme.colors.dim}>... and {issueCount() - 3} more</text>
            )}
          </box>
        </box>

        {/* Agent Harness field */}
        <box
          onMouseDown={() => setFocusedField("harness")}
          backgroundColor={
            isHarnessFocused() ? theme.colors.background : undefined
          }
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <box marginBottom={1}>
            <text fg={fieldColor("harness")}>
              {fieldLabel("harness")}
              <b>Agent Harness</b>
            </text>
          </box>
          <box flexDirection="column" paddingLeft={4}>
            <HarnessList
              options={harnessOptions()}
              selectedIndex={harnessIndex()}
              height={harnessListHeight()}
            />
          </box>
        </box>

        {/* Base Branch field */}
        <box
          onMouseDown={() => setFocusedField("branch")}
          backgroundColor={
            focusedField() === "branch" ? theme.colors.background : undefined
          }
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={2}
        >
          <box marginBottom={1}>
            <text fg={fieldColor("branch")}>
              {fieldLabel("branch")}
              <b>Base Branch</b>
            </text>
          </box>
          <box paddingLeft={4}>
            <box
              backgroundColor={theme.colors.selection}
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={theme.colors.info}>{baseBranch()}</text>
            </box>
          </box>
        </box>

        <ModalFooter
          onConfirm={handleConfirm}
          onCancel={props.onClose}
          onToggle={toggleField}
        />
      </box>
    </box>
  );
}
