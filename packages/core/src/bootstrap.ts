import type { Emitter } from "mitt";
import type { ConfigPaths, JiratownConfig } from "#config";
import { loadConfig, resolveConfigPaths } from "#config";
import { runWithContext } from "#context";
import { Database } from "#db";
import type { HookEventMap } from "#lib/hooks";
import { hooks } from "#lib/hooks";
import { CORE_PLUGINS, OPTIONAL_PLUGINS, PluginRegistry } from "#plugins";
import { MemoryService } from "#services/memory";
import { MonitorService } from "#services/monitor";
import { HarnessOrchestrator } from "#workflow/orchestrator";
import { Tracker } from "#workflow/tracker";

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
  readonly hooks: Emitter<HookEventMap>;

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
 * @param repoRoot - Project root directory (defaults to cwd)
 * @returns Fully initialized Jiratown instance
 *
 * @example
 * ```typescript
 * const jt = await bootstrap();
 * // ... use jt.db, jt.hooks, jt.plugins ...
 * await jt.shutdown();
 * ```
 */
export async function bootstrap(repoRoot?: string): Promise<Jiratown> {
  hooks.all.clear();

  const paths = resolveConfigPaths(repoRoot);
  const config = loadConfig(paths);
  const db = new Database(paths.database);

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
      const plugins = await PluginRegistry.create();

      // Core plugins always registered
      for (const plugin of CORE_PLUGINS) {
        plugins.register(plugin);
      }

      // Optional built-in plugins — activated via config.plugins.enabled
      for (const plugin of OPTIONAL_PLUGINS) {
        if (config.plugins.enabled.includes(plugin.manifest.name)) {
          plugins.register(plugin);
        }
      }

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
