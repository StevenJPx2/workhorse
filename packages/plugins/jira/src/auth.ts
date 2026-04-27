/**
 * Jira OAuth authentication using arctic.
 *
 * Handles OAuth 2.0 3LO flow for Atlassian, storing tokens in the system keychain.
 *
 * @module @jiratown/plugin-jira/auth
 */

import { z } from "zod/v4";
import { getCredential, storeCredential } from "@jiratown/core";
import type { JiraCredentials } from "./types.ts";

const SERVICE = "jira";

const StoredCredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

/** Load credentials from the system keychain */
export async function loadCredentials(): Promise<JiraCredentials | null> {
  const accessToken = await getCredential(SERVICE, "access_token");
  if (!accessToken) return null;

  const [refreshToken, expiresAtStr] = await Promise.all([
    getCredential(SERVICE, "refresh_token"),
    getCredential(SERVICE, "expires_at"),
  ]);

  const result = StoredCredentialsSchema.safeParse({
    accessToken,
    refreshToken: refreshToken ?? undefined,
    expiresAt: expiresAtStr ?? undefined,
  });

  if (!result.success) return null;

  return {
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
    expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : undefined,
  };
}

/** Save credentials to the system keychain */
export async function saveCredentials(creds: JiraCredentials): Promise<void> {
  await storeCredential(SERVICE, "access_token", creds.accessToken);
  if (creds.refreshToken) {
    await storeCredential(SERVICE, "refresh_token", creds.refreshToken);
  }
  if (creds.expiresAt) {
    await storeCredential(SERVICE, "expires_at", creds.expiresAt.toISOString());
  }
}

/** Clear stored credentials */
export async function clearCredentials(): Promise<void> {
  // keytar doesn't have a batch delete, so we just overwrite with empty values
  // or let the user handle it externally
  await storeCredential(SERVICE, "access_token", "");
  await storeCredential(SERVICE, "refresh_token", "");
  await storeCredential(SERVICE, "expires_at", "");
}

/** Create a credential getter for the AtlassianClient */
export function createCredentialGetter(): () => Promise<JiraCredentials> {
  return async () => {
    const creds = await loadCredentials();
    if (!creds) {
      throw new Error(
        "Jira credentials not found. Please authenticate using the Jira auth command.",
      );
    }
    return creds;
  };
}
