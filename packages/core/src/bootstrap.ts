import type { ConfigPaths, JiratownConfig } from "#config";
import { loadConfig, resolveConfigPaths } from "#config";
import { runWithContext } from "#context";
import { Database } from "#db";
import type { HookEmitter } from "#lib/hooks";
import { hooks } from "#lib/hooks";
import { CORE_PLUGINS, type Plugin, PluginRegistry } from "#plugins";
import { MemoryService } from "#services/memory";
import { MonitorService } from "#services/monitor";
import { HarnessOrchestrator } from "#workflow/orchestrator";
import { Tracker } from "#workflow/tracker";

/**
 * Options for bootstrapping a Jiratown instance.
 */
export interface BootstrapOptions {
  /** Project root directory (defaults to cwd) */
  repoRoot?: string;

  /** Additional plugins to register after core plugins */
  plugins?: Plugin[];
}

export interface Jiratown {
  /** Loaded configuration (readonly) */
  readonly config: Readonly<JiratownConfig>;

  /** Resolved paths for config and data files */
  readonly paths: Readonly<ConfigPaths>;

  /** Database instance */
  readonly db: Database;

  /** Memory service for session memory (L1) and semantic search (L2) */
  readonly memory: MemoryService;

  /** Monitor service for polling framework */
  readonly monitors: MonitorService;

  /** Event hooks for pub/sub */
  readonly hooks: HookEmitter;

  /** Tracker for issue parsing and prompt building */
  readonly tracker: Tracker;

  /** Orchestrator for agent lifecycle management */
  readonly orchestrator: HarnessOrchestrator;

  /** Plugin registry */
  readonly plugins: PluginRegistry;

  /** Graceful shutdown */
  shutdown(): Promise<void>;
}

/**
 * Initialize a Jiratown instance with config, database, and plugins.
 *
 * @param options - Bootstrap options (repoRoot, plugins)
 * @returns Fully initialized Jiratown instance
 *
 * @example
 * ```typescript
 * const jt = await bootstrap({
 *   repoRoot: "/path/to/repo",
 *   plugins: [jiraPlugin, githubPlugin],
 * });
 *
 * await jt.shutdown();
 * ```
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<Jiratown> {
  const { repoRoot, plugins: extraPlugins = [] } = options;

  hooks.all.clear();

  const paths = resolveConfigPaths(repoRoot);
  const config = loadConfig(paths);
  const db = await Database.create(paths.database);

  // Initialize memory service (includes L1 session memory and L2 semantic search)
  const memory = await MemoryService.create({
    db,
    hooks,
    worktreesRoot: paths.worktreesRoot,
    memoryDbPath: paths.memoryDatabase,
  });

  // Initialize monitor service (polling framework for plugins)
  const monitors = new MonitorService(hooks, memory, config);

  // Initialize tracker (issue parsing and prompt building)
  const tracker = new Tracker(db, hooks);

  // Initialize orchestrator for agent lifecycle management
  const orchestrator = new HarnessOrchestrator(db, hooks, memory, config);

  return runWithContext(
    { config, paths, hooks, db, memory, monitors, tracker, orchestrator },
    async () => {
      const plugins = new PluginRegistry();

      // Core plugins always registered first
      for (const plugin of CORE_PLUGINS) {
        plugins.register(plugin);
      }

      // Register additional plugins provided via options
      for (const plugin of extraPlugins) {
        plugins.register(plugin);
      }

      // Discover custom plugins from plugin directories
      await plugins.discoverCustomPlugins();

      await plugins.setup();

      return {
        config: Object.freeze(config),
        paths: Object.freeze(paths),
        db,
        memory,
        monitors,
        tracker,
        orchestrator,
        hooks,
        plugins,
        async shutdown() {
          await orchestrator.shutdown();
          monitors.shutdown();
          await plugins.teardown();
          await memory.shutdown();
          db.close();
          hooks.all.clear();
        },
      };
    },
  );
}
