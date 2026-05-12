import { useWorkhorse } from "#context";
import { type Plugin, PluginManifestSchema, type PluginOptions, PluginSymbol } from "./types.ts";

/**
 * Define a Jiratown plugin.
 *
 * The returned plugin wraps setup and teardown to:
 * - Inject the Jiratown context as the first argument
 * - Validate config against configSchema (if provided) and pass as second argument
 * - Emit plugin.error hook on setup failure before re-throwing
 *
 * @example
 * ```typescript
 * // Plugin without config
 * export default definePlugin({
 *   manifest: {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *   },
 *   setup(ctx) {
 *     ctx.hooks.on("issue.parsed", ({ issue }) => {
 *       console.log("Parsed:", issue.title);
 *     });
 *   },
 * });
 *
 * // Plugin with typed config
 * export default definePlugin({
 *   manifest: {
 *     name: "jira",
 *     version: "1.0.0",
 *   },
 *   configSchema: z.object({
 *     cloudId: z.string().min(1),
 *   }),
 *   setup(ctx, config) {
 *     // config is typed as { cloudId: string }
 *     console.log("Connecting to:", config.cloudId);
 *   },
 * });
 * ```
 */
export function definePlugin<TConfig = void>(options: PluginOptions<TConfig>): Plugin {
  const manifest = PluginManifestSchema.parse(options.manifest);

  return {
    manifest,
    auth: options.auth,
    setup: async () => {
      const ctx = useWorkhorse();

      try {
        if (!options.configSchema) {
          await options.setup(ctx);
          return;
        }

        // Pass {} as fallback so schemas with all-optional/defaulted fields work when config is missing
        const result = options.configSchema.safeParse(ctx.config.plugins[manifest.name] ?? {});

        if (!result.success) {
          throw new Error(
            `Invalid config for plugin "${manifest.name}":\n${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`,
          );
        }
        await options.setup(ctx, result.data);
      } catch (error) {
        ctx.hooks.emit("plugin.error", {
          name: manifest.name,
          error: error as Error,
        });
        throw error;
      }
    },
    teardown: options.teardown,
    [PluginSymbol]: true,
  };
}
