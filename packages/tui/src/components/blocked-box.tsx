import { getTheme } from "../theme.ts";

interface BlockedBoxProps {
  message: string;
}

/**
 * Special styled box displayed when an agent is blocked and needs user input.
 * Uses warning colors to draw attention.
 */
export function BlockedBox(props: BlockedBoxProps) {
  const theme = getTheme();
  return (
    <box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <box backgroundColor={theme.colors.warning} paddingLeft={2} paddingRight={2}>
        <text fg={theme.colors.background}>
          <b>⚠ BLOCKED — Need your help</b>
        </text>
      </box>

      {/* Message */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.text}>{props.message}</text>
      </box>
    </box>
  );
}
