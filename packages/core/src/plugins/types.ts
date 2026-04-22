import { z } from "zod/v4";
import type { ZodType } from "zod/v4";

/**
 * Plugin manifest schema — validated with Zod.
 */
export const PluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  capabilities: z
    .object({
      parsers: z.array(z.string()).optional(),
      monitors: z.array(z.string()).optional(),
      tools: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Plugin manifest type.
 */
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Options for defining a plugin.
 *
 * @typeParam TConfig - The type of the plugin's config section, inferred from configSchema.
 */
export interface PluginOptions<TConfig = void> {
  manifest: PluginManifest;
  /**
   * Optional Zod schema to validate the plugin's config section.
   * If provided, the validated config is passed to setup().
   */
  configSchema?: ZodType<TConfig>;
  /**
   * Setup function called when the plugin is initialized.
   * Receives validated config if configSchema is provided.
   */
  setup?: (config: TConfig) => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

/**
 * Unique symbol to identify Jiratown plugins.
 */
export const PluginSymbol = Symbol.for("jiratown.plugin");

/**
 * Plugin interface — a branded PluginOptions.
 */
export interface Plugin<TConfig = void> extends PluginOptions<TConfig> {
  [PluginSymbol]: true;
}

/**
 * Type alias for plugins with any config type.
 * Used in contexts where the config type is not known (e.g., registry).
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for type-erased plugin storage
export type AnyPlugin = Plugin<any>;
