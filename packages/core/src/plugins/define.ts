import { PluginManifestSchema, type Plugin, type PluginOptions } from "./types.ts";

/**
 * Define a Jiratown plugin.
 *
 * @example
 * ```typescript
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
 * ```
 */
export function definePlugin(options: PluginOptions): Plugin {
  // Validate manifest at creation time
  const manifest = PluginManifestSchema.parse(options.manifest);

  return {
    ...options,
    manifest,
    [Symbol.for("jiratown.plugin")]: true,
  } as Plugin;
}
