import type { ConfigPaths, DeepPartial, WorkhorseConfig } from "#config";
import { loadConfig, mergeConfigs, resolveConfigPaths } from "#config";
import { runWithContext } from "#context";
import { Database } from "#db";
import type { HookEmitter } from "#lib/hooks";
import { deferredHooks, hooks } from "#lib/hooks";
import { CORE_PLUGINS, type Plugin, PluginRegistry } from "#plugins";
import { MemoryService } from "#services/memory";
import { MonitorService } from "#services/monitor";
import { HarnessOrchestrator } from "#workflow/orchestrator";
import { Tracker } from "#workflow/tracker";

/**
 * Options for bootstrapping a Workhorse instance.
 */
export interface BootstrapOptions {
  /** Project root directory (defaults to cwd) */
  repoRoot?: string;

  /** Additional plugins to register (before core plugins, so their parsers take priority) */
  plugins?: Plugin[];

  /** Config overrides (merged on top of loaded config) */
  overrides?: DeepPartial<WorkhorseConfig>;
}

export interface Workhorse {
  /** Loaded configuration (readonly) */
  readonly config: Readonly<WorkhorseConfig>;

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
 * Initialize a Workhorse instance with config, database, and plugins.
 *
 * @param options - Bootstrap options (repoRoot, plugins)
 * @returns Fully initialized Workhorse instance
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
export async function bootstrap(options: BootstrapOptions = {}): Promise<Workhorse> {
  const { repoRoot = process.cwd(), plugins: extraPlugins = [], overrides } = options;

  hooks.all.clear();

  const paths = resolveConfigPaths(repoRoot);
  let config = loadConfig(paths);

  // Apply config overrides (e.g., from CLI flags)
  if (overrides) {
    config = mergeConfigs(config, overrides);
  }

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
  const tracker = new Tracker(db, hooks, memory, config);

  // Initialize orchestrator for agent lifecycle management
  const orchestrator = new HarnessOrchestrator(db, hooks, memory, config);

  return runWithContext(
    { config, paths, hooks, db, memory, monitors, tracker, orchestrator },
    async () => {
      const plugins = new PluginRegistry();

      // Register additional plugins provided via options first
      // (they may have parsers that should take priority over fallbacks)
      for (const plugin of extraPlugins) {
        plugins.register(plugin);
      }

      // Discover custom plugins from plugin directories
      await plugins.discoverCustomPlugins();

      // Core plugins registered last (local parser is a fallback that always matches)
      for (const plugin of CORE_PLUGINS) {
        plugins.register(plugin);
      }

      // Start buffering hook emissions during setup
      deferredHooks.startBuffering();

      await plugins.setup();

      // Flush buffered hooks now that all listeners are registered
      deferredHooks.flush();

      // Index codebase intelligence files (README, ARCHITECTURE, etc.)
      // This is deduplicated - only indexes files not already in L2
      await memory.indexer.indexCodebaseIntelligence(repoRoot).catch((err) => {
        console.warn("Failed to index codebase intelligence:", err);
      });

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
