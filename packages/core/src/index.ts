// @jiratown/core — main entry point

export { bootstrap, type Jiratown } from "./bootstrap.ts";
export * from "#config";
export * from "#types";
export { hooks, type HookEventMap, type PromptContext } from "#lib/hooks";
export { useJiratown, tryUseJiratown, runWithContext, type JiratownContext } from "#context";
export {
  definePlugin,
  PluginRegistry,
  PluginManifestSchema,
  type Plugin,
  type PluginOptions,
  type PluginManifest,
} from "#plugins";
export { Database } from "#db";
