// Built-in plugins
import { corePlugin } from "./builtin";

export { definePlugin } from "./define.ts";
export { isPlugin, PluginRegistry } from "./registry.ts";
export type { Plugin, PluginManifest, PluginOptions } from "./types.ts";
export { PluginManifestSchema, PluginSymbol } from "./types.ts";

export const CORE_PLUGINS = [corePlugin];
