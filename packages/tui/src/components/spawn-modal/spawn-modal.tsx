import { createSignal, createMemo } from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { AdapterInfo } from "workhorse-core";
import { getTheme } from "../../theme.ts";
import { useWorkhorseContext } from "../../context/workhorse.tsx";
import { ui } from "../../state/ui.ts";
import { HarnessList } from "./harness-list.tsx";
import type { SpawnModalProps } from "./types.ts";

/** Modal for configuring and spawning an agent for an issue. */
export function SpawnModal(props: SpawnModalProps) {
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
  const [focusedField, setFocusedField] = createSignal<"harness" | "branch">("harness");

  const modalHeight = () => Math.min(20, Math.floor(dimensions().height * 0.8));
  const harnessListHeight = () => Math.max(3, modalHeight() - 11);

  const handleConfirm = () => {
    const selectedHarness = harnessOptions()[harnessIndex()];
    if (selectedHarness && selectedHarness.harness !== "none") {
      props.onSpawn({
        issue: props.issue,
        harness: selectedHarness.harness,
        baseBranch: baseBranch(),
      });
    } else {
      props.onClose();
    }
  };

  useKeyboard((key) => {
    if (ui.modal() !== "spawn") return;
    if (key.name === "return") {
      handleConfirm();
      return;
    }
    if (key.name === "tab") {
      setFocusedField((p) => (p === "harness" ? "branch" : "harness"));
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
  const fieldLabel = (field: "harness" | "branch") => (focusedField() === field ? "▸ " : "  ");
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
        width={50}
        height={modalHeight()}
        backgroundColor={theme.colors.surface}
        borderStyle="rounded"
        borderColor={theme.colors.accent}
      >
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
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <text fg={theme.colors.dim}>Issue: </text>
          <text fg={theme.colors.info}>
            <b>{props.issue.externalId || props.issue.id}</b>
          </text>
        </box>
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <text fg={theme.colors.text}>{props.issue.title}</text>
        </box>
        <box
          backgroundColor={isHarnessFocused() ? theme.colors.background : undefined}
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
        <box
          backgroundColor={focusedField() === "branch" ? theme.colors.background : undefined}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <box marginBottom={1}>
            <text fg={fieldColor("branch")}>
              {fieldLabel("branch")}
              <b>Base Branch</b>
            </text>
          </box>
          <box paddingLeft={4}>
            <box backgroundColor={theme.colors.selection} paddingLeft={1} paddingRight={1}>
              <text fg={theme.colors.info}>{baseBranch()}</text>
            </box>
          </box>
        </box>
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          gap={3}
        >
          <box flexDirection="row">
            <text fg={theme.colors.success}>
              <b>Enter</b>
            </text>
            <text>{"\u00A0"}</text>
            <text fg={theme.colors.dim}>spawn</text>
          </box>
          <box flexDirection="row">
            <text fg={theme.colors.warning}>
              <b>Esc</b>
            </text>
            <text>{"\u00A0"}</text>
            <text fg={theme.colors.dim}>cancel</text>
          </box>
          <box flexDirection="row">
            <text fg={theme.colors.accent}>
              <b>Tab</b>
            </text>
            <text>{"\u00A0"}</text>
            <text fg={theme.colors.dim}>switch field</text>
          </box>
        </box>
      </box>
    </box>
  );
}
