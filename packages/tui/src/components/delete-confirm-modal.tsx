import { createSignal } from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { Issue } from "@jiratown/core";
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

  // Constrain modal to fit in terminal (max 80% height, cap at 16 rows)
  const modalHeight = () => Math.min(16, Math.floor(dimensions().height * 0.8));

  useKeyboard((key) => {
    // Guard: only handle keys when this modal is actually open
    if (ui.modal() !== "delete") return;

    if (key.name === "return") {
      if (selectedOption() === "delete") {
        props.onConfirm(props.issue);
      } else {
        props.onClose();
      }
      return;
    }
    if (key.name === "escape") {
      props.onClose();
      return;
    }
    if (key.name === "left" || key.name === "h" || key.name === "tab") {
      setSelectedOption((prev) => (prev === "cancel" ? "delete" : "cancel"));
      return;
    }
    if (key.name === "right" || key.name === "l") {
      setSelectedOption((prev) => (prev === "cancel" ? "delete" : "cancel"));
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
        width={50}
        height={modalHeight()}
        backgroundColor={theme.colors.surface}
        borderStyle="rounded"
        borderColor={theme.colors.error}
      >
        {/* Header */}
        <box
          backgroundColor={theme.colors.error}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.colors.background}>
            <b>🗑️ DELETE ISSUE</b>
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

        {/* Warning */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg={theme.colors.warning}>⚠️ Are you sure you want to delete this issue?</text>
        </box>
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <text fg={theme.colors.dim}>This will remove the issue from your local backlog.</text>
        </box>

        {/* Action buttons */}
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          gap={3}
        >
          <box
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

        {/* Shortcuts */}
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          gap={3}
        >
          <box>
            <text fg={theme.colors.accent}>
              <b>←→/Tab</b>
            </text>
            <text fg={theme.colors.dim}> switch</text>
          </box>
          <box>
            <text fg={theme.colors.success}>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}> confirm</text>
          </box>
          <box>
            <text fg={theme.colors.warning}>
              <b>ESC</b>
            </text>
            <text fg={theme.colors.dim}> cancel</text>
          </box>
        </box>
      </box>
    </box>
  );
}
