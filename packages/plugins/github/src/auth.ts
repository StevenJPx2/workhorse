/**
 * GitHub authentication provider.
 *
 * Delegates to the `gh` CLI for authentication.
 * Users must run `gh auth login` before using the plugin.
 *
 * @module @jiratown/plugin-github/auth
 */

import type { ExternalProvider } from "@jiratown/core";
import { gh } from "./gh-cli.ts";

/**
 * External auth provider for GitHub.
 * Delegates to the `gh` CLI tool.
 */
export const githubAuthProvider: ExternalProvider = {
  type: "external",
  config: {
    authCommand: "gh auth login",
    statusCommand: "gh auth status",
    instructions: `GitHub authentication is handled by the GitHub CLI (gh).

To authenticate:
1. Install the GitHub CLI: https://cli.github.com
2. Run: gh auth login
3. Follow the prompts to authenticate with your GitHub account

For more options, see: gh auth login --help`,
  },
  isAuthenticated: async () => {
    try {
      await gh(["auth", "status"]);
      return true;
    } catch {
      return false;
    }
  },
};
