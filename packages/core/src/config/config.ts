import { mkdirSync } from "node:fs";
import { DEFAULT_CONFIG } from "./defaults.ts";
import { mergeConfigs, parseTomlFile, writeTomlFile } from "./parse.ts";
import { getConfigPaths } from "./paths.ts";
import type { ConfigPaths, JiratownConfig, PluginConfigSchema } from "./types.ts";

export class Config {
  private config: JiratownConfig = {
    ...DEFAULT_CONFIG,
    plugins: { ...DEFAULT_CONFIG.plugins },
  };

  // ── Load ──────────────────────────────────────────────────────────────────

  load(repoRoot?: string, globalDir?: string): this {
    const paths = getConfigPaths(repoRoot, globalDir);

    // last-arg-wins: global first, project last → project wins
    this.config = mergeConfigs(
      this.config,
      parseTomlFile(paths.globalConfig),
      parseTomlFile(paths.projectConfig),
    );

    return this;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  get(): JiratownConfig {
    return this.config;
  }

  paths(repoRoot?: string): ConfigPaths {
    return getConfigPaths(repoRoot);
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  saveGlobal(overrides: Partial<JiratownConfig>, globalDir?: string): void {
    const { globalConfig, globalDir: dir } = getConfigPaths(undefined, globalDir);

    mkdirSync(dir, { recursive: true });

    writeTomlFile(globalConfig, overrides);
  }

  saveProject(repoRoot: string, overrides: Partial<JiratownConfig>): void {
    const { projectConfig } = getConfigPaths(repoRoot);

    if (!projectConfig) throw new Error("No project root provided");

    writeTomlFile(projectConfig, overrides);
  }

  // ── Plugin config registry ────────────────────────────────────────────────

  registerPluginConfig(schema: PluginConfigSchema): void {
    const raw = this.config.plugins[schema.pluginName];
    const result = schema.schema.safeParse(raw);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid config for plugin "${schema.pluginName}":\n${errors.join("\n")}`);
    }
  }

  getPluginConfig<T>(pluginName: string): T | undefined {
    return this.config.plugins[pluginName] as T | undefined;
  }
}
