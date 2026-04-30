import { theme } from "../theme.ts";

interface BlockedBoxProps {
  message: string;
}

/**
 * Special styled box displayed when an agent is blocked and needs user input.
 */
export function BlockedBox(props: BlockedBoxProps) {
  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={theme.colors.warning}
      padding={1}
      marginBottom={1}
    >
      <text fg={theme.colors.warning}>
        <b>⚠ BLOCKED — Need your help</b>
      </text>
      <text>{props.message}</text>
    </box>
  );
}
