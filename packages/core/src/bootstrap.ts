import type { Emitter } from "mitt";
import type { ConfigPaths, JiratownConfig } from "#config";
import { loadConfig, resolveConfigPaths } from "#config";
import { runWithContext } from "#context";
import { Database } from "#db";
import type { HookEventMap } from "#lib/hooks";
import { hooks } from "#lib/hooks";
import { definePlugin, PluginRegistry } from "#plugins";
import type { Issue } from "#types";

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

  /** Event hooks for pub/sub */
  readonly hooks: Emitter<HookEventMap>;

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

  return runWithContext({ config, paths, hooks }, async () => {
    const plugins = await PluginRegistry.create();
    plugins.register(loggerPlugin);
    await plugins.setup();

    return {
      config: Object.freeze(config),
      paths: Object.freeze(paths),
      db,
      hooks,
      plugins,
      async shutdown() {
        await plugins.teardown();
        db.close();
        hooks.all.clear();
      },
    };
  });
}
