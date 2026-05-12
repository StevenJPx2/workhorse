/**
 * Jira OAuth authentication using Arctic.
 *
 * Handles OAuth 2.0 3LO flow for Atlassian, storing tokens in the system keychain.
 *
 * @module @stevenjpx2/jiratown-plugin-jira/auth
 */

import { Atlassian, generateState, OAuth2RequestError, ArcticFetchError } from "arctic";
import { z } from "zod/v4";
import {
  deleteCredential,
  getCredential,
  storeCredential,
  type OAuthProvider,
  type OAuthTokens,
} from "workhorse-core";
import type { JiraCredentials } from "./types.ts";

const SERVICE = "jira";
const DEFAULT_CALLBACK_PORT = 9876;

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

// Save credentials to the system keychain
export async function saveCredentials(creds: JiraCredentials): Promise<void> {
  await storeCredential(SERVICE, "access_token", creds.accessToken);
  if (creds.refreshToken) {
    await storeCredential(SERVICE, "refresh_token", creds.refreshToken);
  }
  if (creds.expiresAt) {
    await storeCredential(SERVICE, "expires_at", creds.expiresAt.toISOString());
  }
}

// Clear stored credentials
export async function clearCredentials(): Promise<void> {
  await Promise.all([
    deleteCredential(SERVICE, "access_token"),
    deleteCredential(SERVICE, "refresh_token"),
    deleteCredential(SERVICE, "expires_at"),
  ]);
}

// Create a credential getter for the AtlassianClient
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

// Atlassian OAuth 2.0 3LO provider for Jiratown
export function createJiraAuthProvider(
  callbackPort = DEFAULT_CALLBACK_PORT,
): OAuthProvider | undefined {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;

  const atlassian = new Atlassian(
    clientId,
    clientSecret,
    `http://localhost:${callbackPort}/callback`,
  );
  const scopes = ["read:jira-work", "write:jira-work", "read:jira-user", "offline_access"];

  return {
    type: "oauth",
    callbackPort,

    createAuthorizationURL: () => {
      const state = generateState();
      return { url: atlassian.createAuthorizationURL(state, scopes), state };
    },

    validateAuthorizationCode: async (code: string): Promise<OAuthTokens> => {
      try {
        const tokens = await atlassian.validateAuthorizationCode(code);
        return {
          accessToken: tokens.accessToken(),
          refreshToken: tokens.refreshToken(),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
        };
      } catch (error) {
        if (error instanceof OAuth2RequestError) {
          throw new Error(`OAuth error: ${error.code} - ${error.message}`);
        }
        if (error instanceof ArcticFetchError) {
          throw new Error(`Network error during OAuth: ${error.cause}`);
        }
        throw error;
      }
    },

    refreshAccessToken: async (refreshToken: string): Promise<OAuthTokens> => {
      try {
        const tokens = await atlassian.refreshAccessToken(refreshToken);
        return {
          accessToken: tokens.accessToken(),
          refreshToken: tokens.refreshToken(),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
        };
      } catch (error) {
        if (error instanceof OAuth2RequestError) {
          throw new Error(`OAuth refresh error: ${error.code} - ${error.message}`);
        }
        if (error instanceof ArcticFetchError) {
          throw new Error(`Network error during token refresh: ${error.cause}`);
        }
        throw error;
      }
    },

    isAuthenticated: async () => {
      const creds = await loadCredentials();
      if (!creds) return false;

      if (creds.expiresAt && creds.expiresAt < new Date()) {
        if (creds.refreshToken) {
          try {
            const tokens = await atlassian.refreshAccessToken(creds.refreshToken);
            await saveCredentials({
              accessToken: tokens.accessToken(),
              refreshToken: tokens.refreshToken(),
              expiresAt: tokens.accessTokenExpiresAt(),
            });
            return true;
          } catch {
            return false;
          }
        }
        return false;
      }

      return true;
    },

    saveTokens: async (tokens: OAuthTokens) => {
      await saveCredentials({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.accessTokenExpiresAt,
      });
    },

    clearTokens: clearCredentials,

    loadTokens: async () => {
      const creds = await loadCredentials();
      if (!creds) return null;
      return {
        accessToken: creds.accessToken,
        refreshToken: creds.refreshToken,
        accessTokenExpiresAt: creds.expiresAt,
      };
    },
  };
}

// Pre-configured Jira auth provider instance
export const jiraAuthProvider = createJiraAuthProvider();
