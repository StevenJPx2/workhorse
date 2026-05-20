import { createSignal } from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { Issue } from "workhorse-core";
import { getTheme } from "../theme.ts";
import { ui } from "../state/ui.ts";

interface DeleteConfirmModalProps {
  issue: Issue;
  onConfirm: (issue: Issue) => void;
  onClose: () => void;
}

/** Modal for confirming issue deletion. */
export function DeleteConfirmModal(props: DeleteConfirmModalProps) {
  const theme = getTheme();
  const dimensions = useTerminalDimensions();
  const [selectedOption, setSelectedOption] = createSignal<"cancel" | "delete">("cancel");

  // Constrain modal to fit in terminal (max 80% height, cap at 14 rows)
  const modalHeight = () => Math.min(14, Math.floor(dimensions().height * 0.8));

  // oxlint-disable-next-line workhorse/no-single-use-variable -- used in useKeyboard and JSX onMouseDown
  const handleConfirm = () => {
    if (selectedOption() === "delete") {
      props.onConfirm(props.issue);
    } else {
      props.onClose();
    }
  };

  const handleCancel = () => {
    props.onClose();
  };

  // oxlint-disable-next-line workhorse/no-single-use-variable -- used in useKeyboard and JSX onMouseDown
  const toggleSelection = () => {
    setSelectedOption((prev) => (prev === "cancel" ? "delete" : "cancel"));
  };

  useKeyboard((key) => {
    // Guard: only handle keys when this modal is actually open
    if (ui.modal() !== "delete") return;

    if (key.name === "return") {
      handleConfirm();
      return;
    }
    // Note: ESC is handled by global bindings in use-global-bindings.ts
    if (key.name === "left" || key.name === "h" || key.name === "tab") {
      toggleSelection();
      return;
    }
    if (key.name === "right" || key.name === "l") {
      toggleSelection();
    }
  });

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
        borderColor={theme.colors.error}
      >
        {/* Header - full width background */}
        <box
          backgroundColor={theme.colors.error}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          width="100%"
        >
          <text fg={theme.colors.background}>
            <b>🗑️ DELETE ISSUE</b>
          </text>
        </box>

        {/* Issue ID and title */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} flexDirection="row">
          <text fg={theme.colors.info}>
            <b>{props.issue.externalId || props.issue.id}</b>
          </text>
          <text fg={theme.colors.dim}>{" · "}</text>
          <text fg={theme.colors.text}>{props.issue.title}</text>
        </box>

        {/* Warning */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={2}>
          <text fg={theme.colors.warning}>{"⚠️ This will be permanently removed."}</text>
        </box>

        {/* Action buttons - clickable */}
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={2}
          flexDirection="row"
          justifyContent="center"
          gap={4}
        >
          <box
            onMouseDown={handleCancel}
            backgroundColor={selectedOption() === "cancel" ? theme.colors.selection : undefined}
            paddingLeft={2}
            paddingRight={2}
          >
            <text fg={selectedOption() === "cancel" ? theme.colors.success : theme.colors.dim}>
              {selectedOption() === "cancel" ? "▸ " : "  "}
              <b>Cancel</b>
            </text>
          </box>
          <box
            onMouseDown={() => {
              setSelectedOption("delete");
              props.onConfirm(props.issue);
            }}
            backgroundColor={selectedOption() === "delete" ? theme.colors.selection : undefined}
            paddingLeft={2}
            paddingRight={2}
          >
            <text fg={selectedOption() === "delete" ? theme.colors.error : theme.colors.dim}>
              {selectedOption() === "delete" ? "▸ " : "  "}
              <b>Delete</b>
            </text>
          </box>
        </box>

        {/* Shortcuts - clickable */}
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          justifyContent="center"
          gap={3}
        >
          <box flexDirection="row" gap={1} onMouseDown={toggleSelection}>
            <text fg={theme.colors.accent}>
              <b>Tab</b>
            </text>
            <text fg={theme.colors.dim}>switch</text>
          </box>
          <box flexDirection="row" gap={1} onMouseDown={handleConfirm}>
            <text fg={theme.colors.success}>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}>confirm</text>
          </box>
          <box flexDirection="row" gap={1} onMouseDown={handleCancel}>
            <text fg={theme.colors.warning}>
              <b>Esc</b>
            </text>
            <text fg={theme.colors.dim}>cancel</text>
          </box>
        </box>
      </box>
    </box>
  );
}
