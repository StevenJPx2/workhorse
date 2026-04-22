import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { useJiratown } from "#context";
import { type Plugin, PluginSymbol } from "./types.ts";

/**
 * Check if a value is a valid Jiratown plugin.
 */
export function isPlugin(value: unknown): value is Plugin {
  return typeof value === "object" && value !== null && PluginSymbol in value;
}

/**
 * Registry for managing Jiratown plugins.
 *
 * @example
 * ```typescript
 * const registry = new PluginRegistry();
 * await registry.loadPlugins();
 * registry.register(myPlugin);
 * await registry.setup();
 * // ... use plugins ...
 * await registry.teardown();
 * ```
 */
export class PluginRegistry {
  private plugins: Plugin[] = [];

  constructor() {}

  /**
   * Load all configured plugins from enabled list and plugin directories.
   */
  async loadPlugins(): Promise<void> {
    const { config, paths } = useJiratown();

    // 1. Explicitly enabled plugins (npm packages or paths)
    for (const name of config.plugins.enabled) {
      if (!this.has(name)) {
        await this.loadOne(name);
      }
    }

    // 2. Discover from plugin directories (in parallel)
    const discoveries = [this.discoverFrom(join(dirname(paths.globalConfig), "plugins"))];

    if (paths.projectConfig) {
      discoveries.push(this.discoverFrom(join(dirname(paths.projectConfig), "plugins")));
    }

    await Promise.all(discoveries);
  }

  private async loadOne(nameOrPath: string): Promise<void> {
    const mod = await import(nameOrPath);
    const plugin = mod.default ?? mod;

    if (!isPlugin(plugin)) {
      throw new Error(`Module "${nameOrPath}" is not a valid plugin`);
    }

    this.register(plugin);
  }

  private async discoverFrom(directory: string): Promise<void> {
    if (!existsSync(directory)) return;

    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isFile() && !/\.(ts|js|mjs|mts)$/.test(entry.name)) continue;
      if (entry.isDirectory() && !existsSync(join(fullPath, "index.ts"))) continue;

      try {
        await this.loadOne(fullPath);
      } catch {
        // Skip invalid plugins during discovery
      }
    }
  }

  /**
   * Register a plugin instance directly.
   */
  register(plugin: Plugin): void {
    const name = plugin.manifest.name;

    if (this.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    this.plugins.push(plugin);

    const { hooks } = useJiratown();
    hooks.emit("plugin.loaded", { name });
  }

  /**
   * Setup all registered plugins.
   * Fails fast on first error (plugin emits plugin.error before throwing).
   */
  async setup(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.setup?.();
    }
  }

  /**
   * Teardown all plugins in reverse order.
   */
  async teardown(): Promise<void> {
    for (const plugin of [...this.plugins].reverse()) {
      await plugin.teardown?.();
    }
    this.plugins = [];
  }

  /**
   * Get a plugin by name.
   */
  get(name: string): Plugin | undefined {
    return this.plugins.find((p) => p.manifest.name === name);
  }

  /**
   * Check if a plugin is registered.
   */
  has(name: string): boolean {
    return this.plugins.some((p) => p.manifest.name === name);
  }

  /**
   * List all registered plugins.
   */
  list(): Plugin[] {
    return this.plugins;
  }
}
