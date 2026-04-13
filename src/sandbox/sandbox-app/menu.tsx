import { For } from "solid-js";
import { useTheme, spacing } from "../../lib/theme/index.ts";
import { ButtonDemo } from "../demos/button-demo.tsx";
import { CardDemo } from "../demos/card-demo.tsx";
import { TextInputDemo } from "../demos/text-input-demo.tsx";
import { SelectDemo } from "../demos/select-demo.tsx";
import { DialogDemo } from "../demos/dialog-demo.tsx";
import { GridDemo } from "../demos/grid-demo.tsx";
import { StatusBadgeDemo } from "../demos/status-badge-demo.tsx";
import { DividerDemo } from "../demos/divider-demo.tsx";
import { ActionBarDemo } from "../demos/action-bar-demo.tsx";

export interface DemoEntry {
  id: string;
  label: string;
  description: string;
  component: () => import("solid-js").JSX.Element;
}

export const DEMOS: DemoEntry[] = [
  {
    id: "button",
    label: "Button",
    description: "Filled/ghost styles, variants, sizes, icons",
    component: () => <ButtonDemo />,
  },
  {
    id: "card",
    label: "Card",
    description: "Content container with border and title",
    component: () => <CardDemo />,
  },
  {
    id: "text-input",
    label: "TextInput",
    description: "Text input with keyboard handling",
    component: () => <TextInputDemo />,
  },
  {
    id: "select",
    label: "Select",
    description: "Radio group selection with keyboard nav",
    component: () => <SelectDemo />,
  },
  {
    id: "dialog",
    label: "Dialog",
    description: "Modal dialog with title and footer",
    component: () => <DialogDemo />,
  },
  {
    id: "grid",
    label: "Grid",
    description: "Spatial navigation container",
    component: () => <GridDemo />,
  },
  {
    id: "status-badge",
    label: "StatusBadge",
    description: "Ticket status indicators",
    component: () => <StatusBadgeDemo />,
  },
  {
    id: "divider",
    label: "Divider",
    description: "Visual separator lines",
    component: () => <DividerDemo />,
  },
  {
    id: "action-bar",
    label: "ActionBar",
    description: "Keyboard action button row",
    component: () => <ActionBarDemo />,
  },
];

export function Menu(props: { selectedIndex: number }) {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" padding={spacing.md}>
      <text fg={theme().text.secondary} marginBottom={1}>
        Select a component to preview:
      </text>
      <box height={1} />
      <For each={DEMOS}>
        {(demo, i) => {
          const isSelected = () => i() === props.selectedIndex;
          return (
            <box flexDirection="row" height={1}>
              <text fg={isSelected() ? theme().primary : theme().text.dim}>
                {isSelected() ? "▸ " : "  "}
              </text>
              <text fg={isSelected() ? theme().text.primary : theme().text.secondary}>
                {demo.label}
              </text>
              <text fg={theme().text.dim}> — {demo.description}</text>
            </box>
          );
        }}
      </For>
    </box>
  );
}
