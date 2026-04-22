import { resolveConfigPaths, loadConfig } from "#config";
import { Database } from "#db";
import { hooks } from "#lib/hooks";
import { runWithContext } from "#context";
import { PluginRegistry, definePlugin } from "#plugins";
import type { ConfigPaths, JiratownConfig } from "#config";
import type { Emitter } from "mitt";
import type { HookEventMap } from "#lib/hooks";
import type { Issue } from "#types";

// ─── Sample Plugin ───────────────────────────────────────────────────────────

/**
 * A sample builtin plugin that logs lifecycle events.
 * Demonstrates how plugins work with the context system.
 */
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

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export async function bootstrap(repoRoot?: string): Promise<Jiratown> {
  // 1. Clear hooks for clean state (idempotent bootstrap)
  hooks.all.clear();

  // 2. Resolve paths and load config
  const paths = resolveConfigPaths(repoRoot);
  const config = loadConfig(paths);

  // 3. Create database
  const db = new Database(paths.database);

  // 4. Build context object
  const context = {
    config,
    paths,
    hooks,
  };

  // 5. Run everything within context
  return runWithContext(context, async () => {
    // 6. Create plugin registry and load plugins
    const plugins = new PluginRegistry();
    await plugins.loadPlugins();

    // 7. Register builtin sample plugin
    plugins.register(loggerPlugin);

    // 8. Setup all plugins
    await plugins.setup();

    // 9. Build Jiratown instance
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
