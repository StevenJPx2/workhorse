/**
 * ActionBar component demo
 *
 * Keyboard action button rows with different configurations.
 */

import { createSignal } from "solid-js";
import { useTheme } from "../../lib/theme/index.ts";
import { ActionBar } from "../../components/button/action-bar.tsx";

export function ActionBarDemo() {
  const { theme } = useTheme();
  const [lastAction, setLastAction] = createSignal("(none)");

  return (
    <box flexDirection="column" gap={2}>
      {/* Default (right-aligned) */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Right-aligned (default):</text>
        <ActionBar
          actions={[
            { key: "e", action: "escalate", onPress: () => setLastAction("escalate") },
            { key: "a", action: "switch agent", onPress: () => setLastAction("switch agent") },
            { key: "j", action: "open jira", variant: "primary", onPress: () => setLastAction("open jira") },
          ]}
        />
      </box>

      {/* Left-aligned */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Left-aligned:</text>
        <ActionBar
          align="left"
          actions={[
            { key: "n", action: "new ticket", variant: "success", onPress: () => setLastAction("new ticket") },
            { key: "x", action: "close", variant: "danger", onPress: () => setLastAction("close") },
          ]}
        />
      </box>

      {/* Center-aligned with mixed states */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Center-aligned with disabled:</text>
        <ActionBar
          align="center"
          actions={[
            { key: "s", action: "save", variant: "primary" },
            { key: "r", action: "reload", variant: "warning" },
            { key: "d", action: "delete", variant: "danger", disabled: true },
          ]}
        />
      </box>

      {/* Medium size */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Medium size:</text>
        <ActionBar
          size="md"
          actions={[
            { key: "1", action: "option one" },
            { key: "2", action: "option two" },
            { key: "3", action: "option three" },
          ]}
        />
      </box>

      <box marginTop={1}>
        <text fg={theme().text.dim}>Last action (hover to trigger): {lastAction()}</text>
      </box>
    </box>
  );
}
