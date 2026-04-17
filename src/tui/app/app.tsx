/**
 * Root App component for Jiratown TUI
 *
 * Manages global state and renders the main layout with providers.
 */

import { createSignal, createEffect } from "solid-js";
import { AppContent } from "./app-content/index.ts";
import { ThemeProvider } from "../theme/index.ts";
import { NavigationProvider } from "../contexts/navigation-provider.tsx";
import { KeyboardProvider } from "../contexts/keyboard-provider.tsx";
import { ModalSystemProvider } from "../hooks/use-modal-system/index.ts";
import { useConfig } from "../hooks/index.ts";
import type { ThemeName } from "#types/config.ts";

export interface AppProps {
  showAll?: boolean;
  initialTheme?: ThemeName;
}

/**
 * Root App component wrapped with all providers
 */
export function App(props: AppProps) {
  const [theme, setTheme] = createSignal<ThemeName>(props.initialTheme ?? "default");
  const config = useConfig({ autoLoad: true });

  createEffect(() => {
    const loaded = config.config();
    if (loaded) setTheme(loaded.ui.theme);
  });

  return (
    <ThemeProvider initialTheme={theme()} onThemeChange={(t) => config.setTheme(t)}>
      <NavigationProvider>
        <KeyboardProvider>
          <ModalSystemProvider>
            <AppContent showAll={props.showAll} />
          </ModalSystemProvider>
        </KeyboardProvider>
      </NavigationProvider>
    </ThemeProvider>
  );
}
