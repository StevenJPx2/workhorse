import { createSignal } from "solid-js";
import type { ResolvedConfig, JiratownConfig, ThemeName } from "#types/config.ts";
import { loadConfig, saveGlobalConfig, saveProjectConfig, saveTheme } from "#core/config/index.ts";
import { type ConfigStatus, type UseConfigOptions, DEFAULT_CONFIG } from "./types.ts";
export type { ConfigStatus, UseConfigOptions, UseConfigReturn } from "./types.ts";

export function useConfig(options: UseConfigOptions = {}) {
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
        behavior: {
          auto_resume: configToSave.behavior?.auto_resume ?? current.behavior.auto_resume,
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

  const theme = () => config()?.ui.theme ?? DEFAULT_CONFIG.ui.theme;

  const agent = () => config()?.defaults.agent ?? DEFAULT_CONFIG.defaults.agent;

  const cloudId = () => config()?.jira.cloud_id ?? DEFAULT_CONFIG.jira.cloud_id;

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
