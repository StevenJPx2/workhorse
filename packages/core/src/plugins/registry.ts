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
 * All plugins passed to bootstrap() are enabled by default.
 * Use config.plugins.disabled array to opt-out of specific plugins.
 *
 * Custom plugins can be auto-discovered from:
 * - ~/.jiratown/plugins/
 * - .jiratown/plugins/
 *
 * @example
 * ```typescript
 * const registry = new PluginRegistry();
 * registry.register(myPlugin);
 * await registry.setup();
 * // ... use plugins ...
 * await registry.teardown();
 * ```
 */
export class PluginRegistry {
  private plugins: Plugin[] = [];

  /**
   * Discover and load custom plugins from plugin directories.
   */
  async discoverCustomPlugins(): Promise<void> {
    const { paths } = useJiratown();

    await Promise.all([
      this.discover(join(dirname(paths.globalConfig), "plugins")),
      this.discover(join(dirname(paths.projectConfig), "plugins")),
    ]);
  }

  private async load(nameOrPath: string): Promise<void> {
    const mod = await import(nameOrPath);
    const plugin = mod.default ?? mod;

    if (!isPlugin(plugin)) {
      throw new Error(`Module "${nameOrPath}" is not a valid plugin`);
    }

    if (this.has(plugin.manifest.name)) {
      console.warn(`Plugin "${plugin.manifest.name}" is already registered, skipping`);
      return;
    }

    this.register(plugin);
  }

  private async discover(directory: string): Promise<void> {
    if (!existsSync(directory)) return;

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);

      if (entry.isFile() && !/\.(ts|js|mjs|mts)$/.test(entry.name)) continue;
      if (entry.isDirectory() && !existsSync(join(fullPath, "index.ts"))) continue;

      await this.load(fullPath).catch(() => {
        console.warn(`Skipping invalid plugin "${fullPath}"`);
      });
    }
  }

  /**
   * Register a plugin instance directly.
   * Skips if plugin is in the disabled list.
   */
  register(plugin: Plugin): void {
    const name = plugin.manifest.name;
    const { config, hooks } = useJiratown();

    // Skip if plugin is disabled
    if (config.plugins.disabled?.includes(name)) {
      return;
    }

    if (this.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    this.plugins.push(plugin);
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
