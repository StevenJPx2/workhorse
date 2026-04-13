import { createSignal, Show } from "solid-js";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { ThemeProvider, useTheme, spacing } from "../theme/index.ts";
import { NavigationProvider } from "../contexts/navigation-provider.tsx";
import { KeyboardProvider } from "../contexts/keyboard-provider.tsx";
import type { ThemeName } from "#types/config.ts";
import { DEMOS, Menu } from "./menu.tsx";

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
    if (key.name === "q" && !activeDemo()) {
      renderer.destroy();
      return;
    }

    if (key.name === "t" && !activeDemo()) {
      props.onCycleTheme();
      return;
    }

    if (key.name === "escape") {
      setActiveDemo(null);
      return;
    }

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

      <box flexGrow={1} flexDirection="column">
        <Show when={activeDemo()} fallback={<Menu selectedIndex={selectedIndex()} />}>
          <box flexGrow={1} padding={spacing.md}>
            {currentDemo()?.component()}
          </box>
        </Show>
      </box>

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
