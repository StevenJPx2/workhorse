import { Config } from "#config";
import { hooks } from "#lib/hooks";
import { runWithContext, useJiratown } from "#context";
import { PluginRegistry, definePlugin } from "#plugins";
import type { JiratownConfig } from "#config";
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
  setup() {
    const { hooks } = useJiratown();

    hooks.on("plugin.loaded", ({ name }: { name: string }) => {
      console.log(`[plugin] Loaded: ${name}`);
    });

    hooks.on("plugin.error", ({ name, error }: { name: string; error: Error }) => {
      console.error(`[plugin] Error in ${name}: ${error.message}`);
    });

    hooks.on("issue.parsed", ({ issue }: { issue: Issue }) => {
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

  // 2. Create core services
  const config = new Config(repoRoot);

  // 3. Build context object
  const context = {
    config,
    hooks,
  };

  // 4. Run everything within context
  return runWithContext(context, async () => {
    // 5. Create plugin registry (loads plugins)
    const plugins = await PluginRegistry.create();

    // 6. Register builtin sample plugin
    plugins.register(loggerPlugin);

    // 7. Setup all plugins
    await plugins.setup();

    // 8. Build Jiratown instance
    return {
      config: Object.freeze(config.get()),
      hooks,
      plugins,
      async shutdown() {
        await plugins.teardown();
        hooks.all.clear();
      },
    };
  });
}
