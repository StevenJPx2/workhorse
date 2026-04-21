import { useJiratown } from "#context";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { PluginSymbol, type Plugin } from "./types.ts";

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
 * const registry = await PluginRegistry.create();
 * await registry.setup();
 * // ... use plugins ...
 * await registry.teardown();
 * ```
 */
export class PluginRegistry {
  private plugins: Plugin[] = [];
  private initialized = false;

  private constructor() {}

  /**
   * Create and initialize the registry by loading all configured plugins.
   */
  static async create(): Promise<PluginRegistry> {
    const registry = new PluginRegistry();
    await registry.loadAll();
    return registry;
  }

  private async load(nameOrPath: string): Promise<void> {
    const mod = await import(nameOrPath);
    const plugin = mod.default ?? mod;

    if (!isPlugin(plugin)) {
      throw new Error(`Module "${nameOrPath}" is not a valid plugin`);
    }

    this.register(plugin);
  }

  /** Register a plugin instance directly */
  register(plugin: Plugin): void {
    const name = plugin.manifest.name;

    if (this.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    this.plugins.push(plugin);

    const { hooks } = useJiratown();
    hooks.emit("plugin.loaded", { name });
  }

  private async discover(directory: string): Promise<void> {
    if (!existsSync(directory)) return;

    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isFile() && !/\.(ts|js|mjs|mts)$/.test(entry.name)) continue;
      if (entry.isDirectory() && !existsSync(join(fullPath, "index.ts"))) continue;

      try {
        await this.load(fullPath);
      } catch {
        // Skip invalid plugins during discovery
      }
    }
  }

  private async loadAll(): Promise<void> {
    const { config } = useJiratown();
    const paths = config.paths();

    // 1. Explicitly enabled plugins (from node_modules)
    const enabled = config.get().plugins.enabled;
    for (const name of enabled) {
      if (!this.has(name)) {
        await this.load(name);
      }
    }

    // 2. Discover from plugin directories
    const globalPlugins = join(dirname(paths.globalConfig), "plugins");
    await this.discover(globalPlugins);

    if (paths.projectConfig) {
      const projectPlugins = join(dirname(paths.projectConfig), "plugins");
      await this.discover(projectPlugins);
    }
  }

  /**
   * Setup all registered plugins by calling their setup functions.
   */
  async setup(): Promise<void> {
    if (this.initialized) return;

    const { hooks } = useJiratown();

    for (const plugin of this.plugins) {
      try {
        await plugin.setup?.();
      } catch (error) {
        hooks.emit("plugin.error", { name: plugin.manifest.name, error: error as Error });
        throw error;
      }
    }

    this.initialized = true;
  }

  /**
   * Teardown all plugins in reverse order.
   */
  async teardown(): Promise<void> {
    for (const plugin of [...this.plugins].reverse()) {
      await plugin.teardown?.();
    }

    this.plugins = [];
    this.initialized = false;
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
