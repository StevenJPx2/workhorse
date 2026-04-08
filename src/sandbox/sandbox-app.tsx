/**
 * Sandbox - Menu-driven TUI component playground
 *
 * Browse and interact with individual components in isolation.
 * Modeled after opencode's example runner pattern.
 *
 * Navigation:
 *   j/down  - Next item
 *   k/up    - Previous item
 *   Enter   - Open demo
 *   Escape  - Back to menu
 *   t       - Cycle theme
 *   q       - Quit
 */

import { createSignal, Show, For } from "solid-js";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { ThemeProvider, useTheme, spacing } from "../lib/theme/index.ts";
import { NavigationProvider } from "../lib/navigation-provider.tsx";
import { KeyboardProvider } from "../lib/keyboard-provider.tsx";
import type { ThemeName } from "../types/config.ts";

import { ButtonDemo } from "./demos/button-demo.tsx";
import { CardDemo } from "./demos/card-demo.tsx";
import { TextInputDemo } from "./demos/text-input-demo.tsx";
import { SelectDemo } from "./demos/select-demo.tsx";
import { DialogDemo } from "./demos/dialog-demo.tsx";
import { GridDemo } from "./demos/grid-demo.tsx";
import { StatusBadgeDemo } from "./demos/status-badge-demo.tsx";
import { DividerDemo } from "./demos/divider-demo.tsx";
import { ActionBarDemo } from "./demos/action-bar-demo.tsx";

interface DemoEntry {
  id: string;
  label: string;
  description: string;
  component: () => import("solid-js").JSX.Element;
}

const DEMOS: DemoEntry[] = [
  { id: "button", label: "Button", description: "Filled/ghost styles, variants, sizes, icons", component: () => <ButtonDemo /> },
  { id: "card", label: "Card", description: "Content container with border and title", component: () => <CardDemo /> },
  { id: "text-input", label: "TextInput", description: "Text input with keyboard handling", component: () => <TextInputDemo /> },
  { id: "select", label: "Select", description: "Radio group selection with keyboard nav", component: () => <SelectDemo /> },
  { id: "dialog", label: "Dialog", description: "Modal dialog with title and footer", component: () => <DialogDemo /> },
  { id: "grid", label: "Grid", description: "Spatial navigation container", component: () => <GridDemo /> },
  { id: "status-badge", label: "StatusBadge", description: "Ticket status indicators", component: () => <StatusBadgeDemo /> },
  { id: "divider", label: "Divider", description: "Visual separator lines", component: () => <DividerDemo /> },
  { id: "action-bar", label: "ActionBar", description: "Keyboard action button row", component: () => <ActionBarDemo /> },
];

export function SandboxApp() {
  const [theme, setTheme] = createSignal<ThemeName>("tokyonight");

  const cycleTheme = () => {
    const order: ThemeName[] = ["tokyonight", "gruvbox", "default"];
    const i = order.indexOf(theme());
    setTheme(order[(i + 1) % order.length]);
  };

  return (
    <ThemeProvider initialTheme={theme()} onThemeChange={setTheme}>
      <NavigationProvider>
        <KeyboardProvider>
          <SandboxContent onCycleTheme={cycleTheme} />
        </KeyboardProvider>
      </NavigationProvider>
    </ThemeProvider>
  );
}

function SandboxContent(props: { onCycleTheme: () => void }) {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const { theme, themeName } = useTheme();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [activeDemo, setActiveDemo] = createSignal<string | null>(null);

  useKeyboard((key) => {
    // Global: quit
    if (key.name === "q" && !activeDemo()) {
      renderer.destroy();
      return;
    }

    // Global: cycle theme
    if (key.name === "t" && !activeDemo()) {
      props.onCycleTheme();
      return;
    }

    // Back to menu
    if (key.name === "escape") {
      setActiveDemo(null);
      return;
    }

    // Menu navigation
    if (!activeDemo()) {
      if (key.name === "j" || key.name === "down") {
        setSelectedIndex((i) => Math.min(i + 1, DEMOS.length - 1));
      } else if (key.name === "k" || key.name === "up") {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (key.name === "return") {
        setActiveDemo(DEMOS[selectedIndex()].id);
      }
    }
  });

  const currentDemo = () => DEMOS.find((d) => d.id === activeDemo());

  return (
    <box
      flexDirection="column"
      width={dimensions().width}
      height={dimensions().height}
      backgroundColor={theme().bg.base}
    >
      {/* Header */}
      <box
        height={3}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingX={spacing.md}
        border
        borderColor={theme().border.default}
        backgroundColor={theme().bg.elevated}
      >
        <box flexDirection="row" gap={2}>
          <text fg={theme().primary}>
            <strong>Sandbox</strong>
          </text>
          <Show when={activeDemo()}>
            <text fg={theme().text.dim}> › </text>
            <text fg={theme().text.primary}>{currentDemo()?.label}</text>
          </Show>
        </box>
        <text fg={theme().text.dim}>theme: {themeName()}</text>
      </box>

      {/* Content */}
      <box flexGrow={1} flexDirection="column">
        <Show
          when={activeDemo()}
          fallback={<Menu selectedIndex={selectedIndex()} />}
        >
          <box flexGrow={1} padding={spacing.md}>
            {currentDemo()?.component()}
          </box>
        </Show>
      </box>

      {/* Footer */}
      <box
        height={1}
        flexDirection="row"
        justifyContent="center"
        gap={3}
        backgroundColor={theme().bg.elevated}
      >
        <Show
          when={activeDemo()}
          fallback={
            <>
              <text fg={theme().text.dim}>j/k:navigate</text>
              <text fg={theme().text.dim}>enter:open</text>
              <text fg={theme().text.dim}>t:theme</text>
              <text fg={theme().text.dim}>q:quit</text>
            </>
          }
        >
          <text fg={theme().text.dim}>esc:back to menu</text>
          <text fg={theme().text.dim}>t:theme</text>
          <text fg={theme().text.dim}>q:quit</text>
        </Show>
      </box>
    </box>
  );
}

function Menu(props: { selectedIndex: number }) {
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
              <text
                fg={isSelected() ? theme().text.primary : theme().text.secondary}
              >
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
