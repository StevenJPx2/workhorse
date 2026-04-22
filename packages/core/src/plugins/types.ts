import type { ZodType } from "zod/v4";
import { z } from "zod/v4";
import type { JiratownContext } from "#context";

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
export type PluginOptions<TConfig = void> = {
  manifest: PluginManifest;

  /**
   * Teardown function called when the plugin is shut down.
   * Plugins should store any needed references during setup.
   */
  teardown?: () => void | Promise<void>;
} & (
  | {
      /**
       * Optional Zod schema to validate the plugin's config section.
       * If provided, the validated config is passed to setup().
       */
      configSchema?: undefined;

      /**
       * No config schema provided.
       * Setup function receives the Jiratown context.
       */
      setup: (ctx: JiratownContext) => void | Promise<void>;
    }
  | {
      /**
       * Optional Zod schema to validate the plugin's config section.
       * If provided, the validated config is passed to setup().
       */
      configSchema: ZodType<TConfig>;

      /**
       * Config schema provided.
       * Setup function receives the Jiratown context and validated config.
       */
      setup: (ctx: JiratownContext, config: TConfig) => void | Promise<void>;
    }
);

/**
 * Unique symbol to identify Jiratown plugins.
 */
export const PluginSymbol = Symbol.for("jiratown.plugin");

/**
 * Plugin interface — the wrapped plugin object.
 * Setup and teardown take no parameters (context is injected by the wrapper).
 */
export interface Plugin {
  manifest: PluginManifest;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
  [PluginSymbol]: true;
}

/**
 * Type alias for plugins in contexts where type doesn't matter (e.g., registry).
 */
export type AnyPlugin = Plugin;
