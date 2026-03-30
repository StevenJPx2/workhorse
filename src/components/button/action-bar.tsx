/**
 * ActionBar component for Jiratown TUI
 */

import { For } from "solid-js";
import { KeyHint } from "./key-hint.tsx";

export interface ActionBarProps {
  /** Array of action definitions */
  actions: Array<{ key: string; action: string }>;
}

/**
 * Displays a row of keyboard action hints
 *
 * @example
 * <ActionBar actions={[
 *   { key: "e", action: "escalate" },
 *   { key: "a", action: "switch agent" },
 *   { key: "j", action: "open jira" },
 * ]} />
 */
export function ActionBar(props: ActionBarProps) {
  return (
    <box flexDirection="row" gap={2}>
      <For each={props.actions}>
        {(action) => <KeyHint keyName={action.key} action={action.action} />}
      </For>
    </box>
  );
}
