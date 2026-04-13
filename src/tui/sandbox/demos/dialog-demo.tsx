/**
 * Dialog component demo
 *
 * Modal dialog with title, content, and footer.
 * Press Enter to open, Escape to close.
 */

import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useTheme } from "../../theme/index.ts";
import { Dialog } from "../../components/dialog/dialog.tsx";
import { Button } from "../../components/button/button.tsx";

export function DialogDemo() {
  const { theme } = useTheme();
  const [showBasic, setShowBasic] = createSignal(false);
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [selected, setSelected] = createSignal(0);

  useKeyboard((key) => {
    if (showBasic() || showConfirm()) return;

    if (key.name === "j" || key.name === "down") {
      setSelected((s) => Math.min(s + 1, 1));
    } else if (key.name === "k" || key.name === "up") {
      setSelected((s) => Math.max(s - 1, 0));
    } else if (key.name === "return") {
      if (selected() === 0) setShowBasic(true);
      else setShowConfirm(true);
    }
  });

  return (
    <box flexDirection="column" gap={2}>
      <text fg={theme().text.secondary}>Select a dialog and press Enter to open:</text>

      <box flexDirection="column" gap={1}>
        <box flexDirection="row">
          <text fg={selected() === 0 ? theme().primary : theme().text.dim}>
            {selected() === 0 ? "▸ " : "  "}
          </text>
          <text fg={selected() === 0 ? theme().text.primary : theme().text.secondary}>
            Basic Dialog
          </text>
          <text fg={theme().text.dim}> — Simple info dialog</text>
        </box>
        <box flexDirection="row">
          <text fg={selected() === 1 ? theme().primary : theme().text.dim}>
            {selected() === 1 ? "▸ " : "  "}
          </text>
          <text fg={selected() === 1 ? theme().text.primary : theme().text.secondary}>
            Confirm Dialog
          </text>
          <text fg={theme().text.dim}> — With footer actions</text>
        </box>
      </box>

      {/* Basic Dialog */}
      <Dialog
        isOpen={showBasic()}
        onClose={() => setShowBasic(false)}
        lockId="sandbox-basic-dialog"
        title="Information"
        width={50}
        height={10}
        hint="Press Escape to close"
      >
        <text fg={theme().text.primary}>This is a basic dialog with a title and hint text.</text>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog
        isOpen={showConfirm()}
        onClose={() => setShowConfirm(false)}
        lockId="sandbox-confirm-dialog"
        title="Confirm Action"
        width={50}
        height={12}
        footer={
          <box flexDirection="row" gap={2} justifyContent="flex-end">
            <Button label="Cancel" style="ghost" size="sm" onPress={() => setShowConfirm(false)} />
            <Button
              label="Confirm"
              variant="primary"
              size="sm"
              onPress={() => setShowConfirm(false)}
            />
          </box>
        }
      >
        <text fg={theme().text.primary}>Are you sure you want to proceed with this action?</text>
        <text fg={theme().text.dim}>This cannot be undone.</text>
      </Dialog>
    </box>
  );
}
