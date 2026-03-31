/**
 * Theme Switcher component for Jiratown TUI
 *
 * Displays current theme and allows switching between available themes.
 */

import { For } from "solid-js";
import { useTheme, spacing } from "../../lib/theme/index.ts";
import { Button } from "../button/index.ts";

export interface ThemeSwitcherProps {
  /** Whether to show theme names as a list (default: inline button) */
  showList?: boolean;
}

/**
 * Theme switcher component
 *
 * Shows current theme and allows cycling through available themes.
 *
 * @example
 * ```tsx
 * // Button display (click to toggle)
 * <ThemeSwitcher />
 *
 * // List display (shows all themes with selection)
 * <ThemeSwitcher showList />
 * ```
 */
export function ThemeSwitcher(props: ThemeSwitcherProps) {
  const { theme, themeName, setTheme, toggleTheme, availableThemes } =
    useTheme();

  if (props.showList) {
    return (
      <box flexDirection="column" gap={spacing.xs}>
        <text fg={theme().text.secondary}>Theme:</text>
        <For each={availableThemes}>
          {(name) => (
            <box flexDirection="row" gap={spacing.sm}>
              <text fg={theme().text.dim}>
                {themeName() === name ? "[x]" : "[ ]"}
              </text>
              <Button
                label={name}
                variant={themeName() === name ? "primary" : "default"}
                style="outline"
                size="sm"
                onPress={() => setTheme(name)}
              />
            </box>
          )}
        </For>
      </box>
    );
  }

  // Inline button - click to toggle
  return (
    <box flexDirection="row" gap={spacing.sm} alignItems="center">
      <text fg={theme().text.secondary}>Theme:</text>
      <Button
        label={themeName()}
        shortcut="t"
        variant="default"
        style="outline"
        size="sm"
        onPress={toggleTheme}
      />
    </box>
  );
}
