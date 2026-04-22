import { PluginManifestSchema, PluginSymbol, type Plugin, type PluginOptions } from "./types.ts";

/**
 * Define a Jiratown plugin.
 *
 * @example
 * ```typescript
 * // Plugin without config
 * export default definePlugin({
 *   manifest: {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *   },
 *   setup() {
 *     const { hooks } = useJiratown();
 *     hooks.on("issue.parsed", ({ issue }) => {
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
 *   setup(config) {
 *     // config is typed as { cloudId: string }
 *     console.log("Connecting to:", config.cloudId);
 *   },
 * });
 * ```
 */
export function definePlugin<TConfig = void>(options: PluginOptions<TConfig>): Plugin<TConfig> {
  // Validate manifest at creation time
  const manifest = PluginManifestSchema.parse(options.manifest);

  return {
    ...options,
    manifest,
    [PluginSymbol]: true,
  } as Plugin<TConfig>;
}
