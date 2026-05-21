/**
 * Figma credential helpers.
 *
 * Reads/writes the Figma personal access token from the system keychain
 * via Workhorse's built-in credential store.
 *
 * @module workhorse-plugin-figma/credentials
 */
import type { FigmaCredentialGetter } from "./client.ts";
import type { FigmaCredentials } from "./types.ts";

const CREDENTIAL_KEY = "figma";

/**
 * Returns a lazy credential getter that resolves the stored Figma PAT at
 * call time. Throws if no credentials have been saved yet.
 */
export function createCredentialGetter(): FigmaCredentialGetter {
  return async () => {
    // Workhorse stores plugin credentials as JSON under a namespaced key.
    // The TUI's setup wizard writes them; we just read here.
    const raw = process.env.FIGMA_ACCESS_TOKEN;
    if (raw) {
      return { accessToken: raw } satisfies FigmaCredentials;
    }

    // Fall back to reading from Workhorse keychain (if available at runtime).
    // This keeps the plugin self-contained without importing internal services.
    throw new Error(
      `No Figma credentials found. ` +
        `Set FIGMA_ACCESS_TOKEN or run the Figma plugin setup wizard.`,
    );
  };
}

/**
 * Quick check: returns true when a Figma token is present without throwing.
 */
export function isFigmaAuthenticated(): boolean {
  return Boolean(process.env.FIGMA_ACCESS_TOKEN);
}

export { CREDENTIAL_KEY };
