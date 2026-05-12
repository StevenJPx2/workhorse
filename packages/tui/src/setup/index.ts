export {
  getPluginsNeedingSetup,
  loadExistingConfig,
  PLUGIN_REQUIREMENTS,
  savePluginConfig,
  setupValuesToConfig,
} from "./validate.ts";
export type { PluginConfigRequirement } from "./validate.ts";

// Auth utilities
export {
  checkAllPluginsAuth,
  checkPluginAuth,
  formatAuthInstructions,
  getPluginsNeedingAuth,
} from "./auth.ts";
export type { PluginAuthRequirement } from "./auth.ts";
