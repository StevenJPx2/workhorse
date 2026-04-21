import { z } from "zod/v4";

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
 */
export interface PluginOptions {
  manifest: PluginManifest;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

/**
 * Unique symbol to identify Jiratown plugins.
 */
export const PluginSymbol = Symbol.for("jiratown.plugin");

/**
 * Plugin interface — a branded PluginOptions.
 */
export interface Plugin extends PluginOptions {
  [PluginSymbol]: true;
}
