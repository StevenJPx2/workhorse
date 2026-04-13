/**
 * KeyHint component for Jiratown TUI
 */

import { colors } from "../../theme/index.ts";

export interface KeyHintProps {
  /** The key to press */
  keyName: string;
  /** Description of what the key does */
  action: string;
  /** Whether to show in compact form */
  compact?: boolean;
}

/**
 * Displays a keyboard shortcut hint
 *
 * @example
 * <KeyHint keyName="q" action="quit" />
 * // Renders: [q] quit
 *
 * @example
 * <KeyHint keyName="Enter" action="confirm" compact />
 * // Renders: [Enter]
 */
export function KeyHint(props: KeyHintProps) {
  return (
    <box flexDirection="row">
      <text fg={colors.text.secondary}>[</text>
      <text fg={colors.primary}>{props.keyName}</text>
      <text fg={colors.text.secondary}>]</text>
      {!props.compact && <text fg={colors.text.dim}> {props.action}</text>}
    </box>
  );
}
