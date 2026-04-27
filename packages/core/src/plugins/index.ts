// Built-in plugins
import { corePlugin } from "./builtin/index.ts";
import { jiraPlugin } from "./builtin/jira/index.ts";
import { piAdapterPlugin } from "./builtin/pi-adapter/index.ts";

export { definePlugin } from "./define.ts";
export { isPlugin, PluginRegistry } from "./registry.ts";
export type { Plugin, PluginManifest, PluginOptions } from "./types.ts";
export { PluginManifestSchema, PluginSymbol } from "./types.ts";

export const CORE_PLUGINS = [corePlugin, piAdapterPlugin];
export const OPTIONAL_PLUGINS = [jiraPlugin];

export { corePlugin, jiraPlugin, piAdapterPlugin };
