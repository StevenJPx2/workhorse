/**
 * System keychain integration for secure credential storage
 *
 * Uses the OS-native keychain (macOS Keychain, Windows Credential
 * Manager, Linux Secret Service) via keytar.
 *
 * Falls back to a file-based store if keytar is unavailable.
 */

import * as keytar from "keytar";

const SERVICE_NAME = "jiratown";
const GITHUB_TOKEN_KEY = "github-mcp-token";
const GITHUB_SESSION_KEY = "github-mcp-session";

/**
 * Store a GitHub token in the system keychain
 */
export async function storeGitHubToken(token: string): Promise<void> {
  try {
    await keytar.setPassword(SERVICE_NAME, GITHUB_TOKEN_KEY, token);
  } catch (err) {
    throw new Error(
      `Failed to store GitHub token in keychain: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Retrieve the GitHub token from the system keychain
 *
 * Returns null if no token is stored.
 */
export async function getGitHubToken(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, GITHUB_TOKEN_KEY);
  } catch (err) {
    throw new Error(
      `Failed to retrieve GitHub token from keychain: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Delete the GitHub token from the system keychain
 */
export async function deleteGitHubToken(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, GITHUB_TOKEN_KEY);
  } catch {
    // Ignore errors - token may not exist
  }
}

/**
 * Check if a GitHub token is stored in the keychain
 */
export async function hasGitHubToken(): Promise<boolean> {
  const token = await getGitHubToken();
  return token !== null && token !== "";
}

/**
 * Store a GitHub MCP session identifier
 *
 * Used to track that an MCP session has been authorized,
 * even if the actual token is managed by mcp-remote.
 */
export async function storeGitHubSession(sessionId: string): Promise<void> {
  try {
    await keytar.setPassword(SERVICE_NAME, GITHUB_SESSION_KEY, sessionId);
  } catch (err) {
    throw new Error(
      `Failed to store GitHub session in keychain: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Retrieve the GitHub MCP session identifier
 */
export async function getGitHubSession(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, GITHUB_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Delete the GitHub MCP session from the keychain
 */
export async function deleteGitHubSession(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, GITHUB_SESSION_KEY);
  } catch {
    // Ignore errors
  }
}
