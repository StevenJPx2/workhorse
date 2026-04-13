/**
 * HelpDialog component - Displays keyboard shortcuts
 */

import { useKeyboard } from "@opentui/solid";
import { Dialog } from "../components/dialog/index.ts";
import { useTheme } from "../theme/index.ts";

interface HelpDialogProps {
  onClose: () => void;
}

const shortcuts = [
  { key: ":", desc: "Command palette" },
  { key: "+/n", desc: "Add new ticket" },
  { key: "j/k", desc: "Navigate tickets" },
  { key: "1-9", desc: "Jump to ticket" },
  { key: "x", desc: "Close current ticket" },
  { key: "o", desc: "Open in Jira" },
  { key: "e", desc: "Escalate / ask question" },
  { key: "a", desc: "Switch agent" },
  { key: "s", desc: "Start/stop agent" },
  { key: "t", desc: "Toggle theme" },
  { key: "?", desc: "Toggle help" },
  { key: "q", desc: "Quit" },
];

export function HelpDialog(props: HelpDialogProps) {
  const { theme } = useTheme();

  useKeyboard(() => {
    props.onClose();
  });

  return (
    <Dialog
      isOpen={true}
      onClose={props.onClose}
      lockId="help-dialog"
      title="Keyboard Shortcuts"
      hint="Press any key to close"
      width={40}
      height={18}
      closeOnEscape={false}
    >
      <box flexDirection="column">
        {shortcuts.map((s) => (
          <box flexDirection="row" height={1}>
            <box width={8}>
              <text fg={theme().primary}>[{s.key}]</text>
            </box>
            <text fg={theme().text.primary}>{s.desc}</text>
          </box>
        ))}
      </box>
    </Dialog>
  );
}
