import { getTheme } from "../../theme.ts";

interface ModalFooterProps {
  onConfirm: () => void;
  onCancel: () => void;
  onToggle: () => void;
}

/** Reusable modal footer with keyboard shortcuts. */
export function ModalFooter(props: ModalFooterProps) {
  const theme = getTheme();

  return (
    <box
      backgroundColor={theme.colors.background}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      flexDirection="row"
      justifyContent="center"
      gap={3}
    >
      <box flexDirection="row" gap={1} onMouseDown={props.onConfirm}>
        <text fg={theme.colors.success}>
          <b>Enter</b>
        </text>
        <text fg={theme.colors.dim}>spawn</text>
      </box>
      <box flexDirection="row" gap={1} onMouseDown={props.onCancel}>
        <text fg={theme.colors.warning}>
          <b>Esc</b>
        </text>
        <text fg={theme.colors.dim}>cancel</text>
      </box>
      <box flexDirection="row" gap={1} onMouseDown={props.onToggle}>
        <text fg={theme.colors.accent}>
          <b>Tab</b>
        </text>
        <text fg={theme.colors.dim}>switch</text>
      </box>
    </box>
  );
}
