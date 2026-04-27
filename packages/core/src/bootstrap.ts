import type { Emitter } from "mitt";
import type { ConfigPaths, JiratownConfig } from "#config";
import { loadConfig, resolveConfigPaths } from "#config";
import { runWithContext } from "#context";
import type { Issue } from "#db";
import { Database } from "#db";
import type { HookEventMap } from "#lib/hooks";
import { hooks } from "#lib/hooks";
import { corePlugin, definePlugin, piAdapterPlugin, PluginRegistry } from "#plugins";
import { MemoryService } from "#services/memory";
import { MonitorService } from "#services/monitor";
import { HarnessOrchestrator } from "#workflow/orchestrator";
import { Tracker } from "#workflow/tracker";

const loggerPlugin = definePlugin({
  manifest: {
    name: "builtin-logger",
    version: "1.0.0",
    description: "Logs Jiratown lifecycle events",
    capabilities: {
      monitors: ["lifecycle"],
    },
  },
  setup(ctx) {
    ctx.hooks.on("plugin.loaded", ({ name }: { name: string }) => {
      console.log(`[plugin] Loaded: ${name}`);
    });

    ctx.hooks.on("plugin.error", ({ name, error }: { name: string; error: Error }) => {
      console.error(`[plugin] Error in ${name}: ${error.message}`);
    });

    ctx.hooks.on("issue.parsed", ({ issue }: { issue: Issue }) => {
      console.log(`[issue] Parsed: ${issue.title} (${issue.externalId})`);
    });

    console.log("[logger] Plugin initialized");
  },
  teardown() {
    console.log("[logger] Plugin shutting down");
  },
});

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
    { config, paths, hooks, memory, monitors, tracker, orchestrator },
    async () => {
      const plugins = await PluginRegistry.create();
      plugins.register(loggerPlugin);
      plugins.register(corePlugin);
      plugins.register(piAdapterPlugin);
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
