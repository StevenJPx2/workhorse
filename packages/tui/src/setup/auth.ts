/**
 * Plugin authentication status checking.
 *
 * Checks which plugins need authentication before the TUI can start.
 *
 * @module workhorse/setup/auth
 */

import type { Plugin, AuthProvider, AuthStatus } from "workhorse-core";

/**
 * Plugin with auth requirements for TUI display.
 */
export interface PluginAuthRequirement {
  /** Plugin name */
  name: string;
  /** Plugin description */
  description?: string;
  /** Auth provider from the plugin */
  auth: AuthProvider;
  /** Current auth status */
  status: AuthStatus;
}

/**
 * Check authentication status for a single plugin.
 */
export async function checkPluginAuth(plugin: Plugin): Promise<AuthStatus> {
  const { manifest, auth } = plugin;

  // No auth required
  if (!auth || auth.type === "none") {
    return {
      pluginName: manifest.name,
      authenticated: true,
      provider: "none",
    };
  }

  try {
    return {
      pluginName: manifest.name,
      authenticated: await auth.isAuthenticated(),
      provider: auth.type,
    };
  } catch (error) {
    return {
      pluginName: manifest.name,
      authenticated: false,
      provider: auth.type,
      error: error instanceof Error ? error.message : "Auth check failed",
    };
  }
}

/**
 * Check authentication status for multiple plugins.
 */
export async function checkAllPluginsAuth(
  plugins: Plugin[],
): Promise<AuthStatus[]> {
  return Promise.all(plugins.map(checkPluginAuth));
}

/**
 * Get plugins that need authentication.
 * Returns plugins where auth is required but not yet authenticated.
 */
export async function getPluginsNeedingAuth(
  plugins: Plugin[],
): Promise<PluginAuthRequirement[]> {
  const needsAuth: PluginAuthRequirement[] = [];

  for (const plugin of plugins) {
    const { manifest, auth } = plugin;

    // Skip plugins with no auth or "none" type
    if (!auth || auth.type === "none") {
      continue;
    }

    const status = await checkPluginAuth(plugin);

    // Add to list if not authenticated
    if (!status.authenticated) {
      needsAuth.push({
        name: manifest.name,
        description: manifest.description,
        auth,
        status,
      });
    }
  }

  return needsAuth;
}

/**
 * Format auth instructions for display.
 */
export function formatAuthInstructions(
  requirement: PluginAuthRequirement,
): string {
  const { auth, name } = requirement;

  if (auth.type === "oauth") {
    return `${name} requires OAuth authentication. Press Enter to open your browser and sign in.`;
  }

  if (auth.type === "external") {
    return auth.config.instructions;
  }

  if (auth.type === "apitoken") {
    return `${name} requires API token authentication. Press Enter to configure.`;
  }

  return `${name} requires authentication.`;
}
