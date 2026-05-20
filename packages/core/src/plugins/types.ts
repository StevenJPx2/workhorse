import z from "zod";

import type { WorkhorseContext } from "#context";

import type { AuthProvider } from "../auth/types.ts";

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
      adapters: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
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
   * Authentication provider for this plugin.
   * Declares how the plugin authenticates (OAuth, external CLI, or none).
   * The TUI uses this to show appropriate auth flows.
   */
  auth?: AuthProvider;

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
       * Setup function receives the Workhorse context.
       */
      setup: (ctx: WorkhorseContext) => void | Promise<void>;
    }
  | {
      /**
       * Optional Zod schema to validate the plugin's config section.
       * If provided, the validated config is passed to setup().
       */
      configSchema: z.ZodType<TConfig>;

      /**
       * Config schema provided.
       * Setup function receives the Workhorse context and validated config.
       */
      setup: (ctx: WorkhorseContext, config: TConfig) => void | Promise<void>;
    }
);

/**
 * Unique symbol to identify Workhorse plugins.
 */
export const PluginSymbol = Symbol.for("workhorse.plugin");

/**
 * Plugin interface — the wrapped plugin object.
 * Setup and teardown take no parameters (context is injected by the wrapper).
 */
export interface Plugin {
  manifest: PluginManifest;
  /** Authentication provider for this plugin */
  auth?: AuthProvider;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
  [PluginSymbol]: true;
}
