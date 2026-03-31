/**
 * Theme context for Solid.js
 *
 * Provides reactive theme state that can be used throughout the app.
 */

import {
  createContext,
  useContext,
  createSignal,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import { themes } from "./index.ts";
import type { Theme, ThemeName } from "./types.ts";

// Theme context value type
export interface ThemeContextValue {
  /** Current theme object */
  theme: Accessor<Theme>;
  /** Current theme name */
  themeName: Accessor<ThemeName>;
  /** Set the active theme */
  setTheme: (name: ThemeName) => void;
  /** Toggle between available themes */
  toggleTheme: () => void;
  /** List of available theme names */
  availableThemes: ThemeName[];
}

// Create context with undefined default (will be provided by ThemeProvider)
const ThemeContext = createContext<ThemeContextValue>();

// Available theme names in order for cycling
const THEME_NAMES: ThemeName[] = ["default", "gruvbox"];

export interface ThemeProviderProps {
  /** Initial theme name (default: "default") */
  initialTheme?: ThemeName;
  /** Callback when theme changes (for persistence) */
  onThemeChange?: (themeName: ThemeName) => void;
}

/**
 * Theme provider component
 *
 * Wrap your app with this to enable theme switching.
 *
 * @example
 * ```tsx
 * <ThemeProvider initialTheme="gruvbox">
 *   <App />
 * </ThemeProvider>
 * ```
 */
export const ThemeProvider: ParentComponent<ThemeProviderProps> = (props) => {
  const [themeName, setThemeName] = createSignal<ThemeName>(
    props.initialTheme ?? "default"
  );

  const theme = () => themes[themeName()];

  const setTheme = (name: ThemeName) => {
    if (themes[name]) {
      setThemeName(name);
      props.onThemeChange?.(name);
    }
  };

  const toggleTheme = () => {
    const currentIndex = THEME_NAMES.indexOf(themeName());
    const nextIndex = (currentIndex + 1) % THEME_NAMES.length;
    setTheme(THEME_NAMES[nextIndex]);
  };

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    toggleTheme,
    availableThemes: THEME_NAMES,
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access the current theme
 *
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { theme, toggleTheme } = useTheme();
 *   return <box backgroundColor={theme().bg.base}>...</box>;
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Get a theme by name (non-reactive, for use outside components)
 */
export function getTheme(name: ThemeName): Theme {
  return themes[name];
}
