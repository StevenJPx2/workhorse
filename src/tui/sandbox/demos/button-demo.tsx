/**
 * Button component demo
 *
 * Showcases all button variants, styles, sizes, icons, and shortcuts.
 */

import { createSignal } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import { Button } from "../../components/button/button.tsx";
import { ButtonGroup } from "../../components/button/button-group.tsx";

export function ButtonDemo() {
  const { theme } = useTheme();
  const [pressCount, setPressCount] = createSignal(0);

  return (
    <box flexDirection="column" gap={2}>
      {/* Filled variants */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Filled variants:</text>
        <box flexDirection="row" gap={2}>
          <Button label="Default" onPress={() => setPressCount((c) => c + 1)} />
          <Button label="Primary" variant="primary" />
          <Button label="Success" variant="success" />
          <Button label="Warning" variant="warning" />
          <Button label="Danger" variant="danger" />
          <Button label="Disabled" disabled />
        </box>
      </box>

      {/* Ghost variants */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Ghost variants:</text>
        <box flexDirection="row" gap={2}>
          <Button label="Default" style="ghost" />
          <Button label="Primary" variant="primary" style="ghost" />
          <Button label="Success" variant="success" style="ghost" />
          <Button label="Warning" variant="warning" style="ghost" />
          <Button label="Danger" variant="danger" style="ghost" />
        </box>
      </box>

      {/* Sizes */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Sizes:</text>
        <box flexDirection="row" gap={2} alignItems="center">
          <Button label="Small" size="sm" variant="primary" />
          <Button label="Medium" size="md" variant="primary" />
          <Button label="Large" size="lg" variant="primary" />
        </box>
      </box>

      {/* Icons & shortcuts */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Icons & shortcuts:</text>
        <box flexDirection="row" gap={2}>
          <Button label="New" icon="+" variant="success" />
          <Button label="Delete" icon="×" iconPosition="right" variant="danger" />
          <Button label="save" shortcut="Ctrl+S" variant="primary" />
          <Button label="quit" shortcut="q" variant="danger" style="ghost" />
        </box>
      </box>

      {/* ButtonGroup */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>ButtonGroup:</text>
        <ButtonGroup
          buttons={[
            { label: "Save", shortcut: "s", variant: "primary" },
            { label: "Cancel", shortcut: "c" },
            { label: "Delete", shortcut: "d", variant: "danger" },
          ]}
          style="ghost"
          size="sm"
        />
      </box>

      {/* Press counter */}
      <box marginTop={1}>
        <text fg={theme().text.dim}>Press count (hover Default button): {pressCount()}</text>
      </box>
    </box>
  );
}
