/**
 * Visual test helper - renders components with full provider stack
 *
 * Uses @opentui/solid testRender to render components offscreen,
 * capture frames as plain text, and simulate user input.
 *
 * Known limitation: mockInput.pressEscape() does not fire useKeyboard handlers
 * because the terminal escape sequence parser waits on an async timer to
 * disambiguate \x1b from multi-byte sequences (arrow keys, etc). Test Escape
 * behavior by toggling props instead.
 */

import { testRender } from "@opentui/solid";
import { ThemeProvider } from "../lib/theme/context.tsx";
import { NavigationProvider } from "../lib/navigation-provider.tsx";
import { KeyboardProvider } from "../lib/keyboard-provider.tsx";
import type { ThemeName } from "../types/config.ts";
import type { JSX } from "solid-js";

export interface RenderOptions {
  width?: number;
  height?: number;
  theme?: ThemeName;
}

/**
 * Render a component wrapped in all required providers (Theme, Navigation, Keyboard).
 * Returns the testRender context with frame capture and input simulation.
 */
export async function renderWithProviders(
  component: () => JSX.Element,
  options: RenderOptions = {},
) {
  const { width = 80, height = 24, theme = "tokyonight" } = options;

  const ctx = await testRender(
    () => (
      <ThemeProvider initialTheme={theme}>
        <NavigationProvider>
          <KeyboardProvider>{component()}</KeyboardProvider>
        </NavigationProvider>
      </ThemeProvider>
    ),
    { width, height },
  );

  await ctx.renderOnce();

  return ctx;
}
