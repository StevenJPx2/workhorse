/**
 * useConfig hook - Reactive configuration management
 *
 * Provides reactive access to Jiratown configuration with
 * load, save, and update capabilities.
 */

import { createSignal, type Accessor } from "solid-js";
import type {
  ResolvedConfig,
  JiratownConfig,
  ThemeName,
  AgentType,
} from "../../types/config.ts";
import {
  loadConfig,
  saveGlobalConfig,
  saveProjectConfig,
  saveTheme,
} from "../../lib/config.ts";

/**
 * Config loading status
 */
export type ConfigStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Options for the config hook
 */
export interface UseConfigOptions {
  /** Whether to auto-load config on mount */
  autoLoad?: boolean;
  /** Current working directory for project config */
  cwd?: string;
  /** Callback when config is loaded */
  onLoad?: (config: ResolvedConfig) => void;
  /** Callback when config save fails */
  onError?: (error: Error) => void;
}

/**
 * Return value from useConfig hook
 */
export interface UseConfigReturn {
  /** Current config loading status */
  status: Accessor<ConfigStatus>;
  /** Current loaded config (null if not loaded) */
  config: Accessor<ResolvedConfig | null>;
  /** Last error if any */
  error: Accessor<Error | null>;
  /** Load configuration */
  load: () => Promise<ResolvedConfig>;
  /** Save to global config */
  saveGlobal: (config: JiratownConfig) => void;
  /** Save to project config */
  saveProject: (config: JiratownConfig) => Promise<void>;
  /** Update theme and persist */
  setTheme: (theme: ThemeName) => Promise<void>;
  /** Get current theme */
  theme: Accessor<ThemeName>;
  /** Get current default agent */
  agent: Accessor<AgentType>;
  /** Get Jira cloud ID */
  cloudId: Accessor<string>;
}

/**
 * Default config values
 */
const DEFAULT_CONFIG: ResolvedConfig = {
  jira: { cloud_id: "" },
  defaults: { agent: "opencode" },
  ui: { theme: "tokyonight" },
};

/**
 * Hook for managing Jiratown configuration
 *
 * @example
 * ```tsx
 * function Settings() {
 *   const { config, load, setTheme, theme } = useConfig({ autoLoad: true });
 *
 *   return (
 *     <box>
 *       <text>Theme: {theme()}</text>
 *       <button onPress={() => setTheme('gruvbox')}>
 *         Switch to Gruvbox
 *       </button>
 *     </box>
 *   );
 * }
 * ```
 */
export function useConfig(options: UseConfigOptions = {}): UseConfigReturn {
  const [status, setStatus] = createSignal<ConfigStatus>("idle");
  const [config, setConfig] = createSignal<ResolvedConfig | null>(null);
  const [error, setError] = createSignal<Error | null>(null);

  const load = async (): Promise<ResolvedConfig> => {
    try {
      setStatus("loading");
      const loaded = await loadConfig(options.cwd);
      setConfig(loaded);
      setStatus("loaded");
      setError(null);
      options.onLoad?.(loaded);
      return loaded;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setStatus("error");
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const saveGlobal = (configToSave: JiratownConfig): void => {
    try {
      saveGlobalConfig(configToSave);
      // Update local state with merged config
      const current = config() ?? DEFAULT_CONFIG;
      setConfig({
        jira: {
          cloud_id: configToSave.jira?.cloud_id ?? current.jira.cloud_id,
        },
        defaults: {
          agent: configToSave.defaults?.agent ?? current.defaults.agent,
        },
        ui: {
          theme: configToSave.ui?.theme ?? current.ui.theme,
        },
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const saveProject = async (configToSave: JiratownConfig): Promise<void> => {
    try {
      await saveProjectConfig(configToSave, options.cwd);
      // Reload to get merged config
      await load();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  const setTheme = async (themeName: ThemeName): Promise<void> => {
    try {
      await saveTheme(themeName);
      // Update local state
      const current = config();
      if (current) {
        setConfig({ ...current, ui: { theme: themeName } });
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      options.onError?.(e);
      throw e;
    }
  };

  // Derived accessors
  const theme: Accessor<ThemeName> = () =>
    config()?.ui.theme ?? DEFAULT_CONFIG.ui.theme;

  const agent: Accessor<AgentType> = () =>
    config()?.defaults.agent ?? DEFAULT_CONFIG.defaults.agent;

  const cloudId: Accessor<string> = () =>
    config()?.jira.cloud_id ?? DEFAULT_CONFIG.jira.cloud_id;

  // Auto-load if requested
  if (options.autoLoad) {
    load();
  }

  return {
    status,
    config,
    error,
    load,
    saveGlobal,
    saveProject,
    setTheme,
    theme,
    agent,
    cloudId,
  };
}
