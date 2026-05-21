/**
 * Jira credential storage and loading.
 * @module workhorse-plugin-jira/credentials
 */
import {
  deleteCredential,
  getCredential,
  storeCredential,
} from "workhorse-core";
import { z } from "zod/v4";

import type { JiraCredentials } from "./types.ts";

const SERVICE = "jira";

const StoredCredentialsSchema = z.object({
  email: z.string().min(1),
  apiToken: z.string().min(1),
  siteUrl: z.string().min(1),
});

/**
 * Resolve a value that may be an environment variable reference.
 * If value starts with $, treat it as an env var name and resolve it.
 * Returns null if env var reference doesn't exist.
 */
export function resolveEnvVar(value: string): string | null {
  if (value.startsWith("$")) return process.env[value.slice(1)] || null;
  return value;
}

/**
 * Load credentials from environment variables first, then fall back to keychain.
 * Environment variables: JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE_URL
 *
 * Keychain values can also be env var references (e.g., "$ATLASSIAN_API_KEY")
 * which are resolved at runtime.
 */
export async function loadCredentials(): Promise<JiraCredentials | null> {
  // Try environment variables first
  const envEmail = process.env.JIRA_EMAIL;
  const envApiToken = process.env.JIRA_API_TOKEN;
  const envSiteUrl = process.env.JIRA_SITE_URL;

  if (envEmail && envApiToken && envSiteUrl) {
    const result = StoredCredentialsSchema.safeParse({
      email: envEmail,
      apiToken: envApiToken,
      siteUrl: envSiteUrl,
    });
    if (result.success) return result.data;
  }

  // Fall back to keychain (values may be env var references like "$ATLASSIAN_API_KEY")
  const [rawEmail, rawApiToken, rawSiteUrl] = await Promise.all([
    getCredential(SERVICE, "email"),
    getCredential(SERVICE, "api_token"),
    getCredential(SERVICE, "site_url"),
  ]);

  if (!rawEmail || !rawApiToken || !rawSiteUrl) return null;

  // Resolve any env var references
  const email = resolveEnvVar(rawEmail);
  const apiToken = resolveEnvVar(rawApiToken);
  const siteUrl = resolveEnvVar(rawSiteUrl);

  if (!email || !apiToken || !siteUrl) return null;

  const result = StoredCredentialsSchema.safeParse({
    email,
    apiToken,
    siteUrl,
  });
  return result.success ? result.data : null;
}

/** Save credentials to the system keychain */
export async function saveCredentials(creds: JiraCredentials): Promise<void> {
  await Promise.all([
    storeCredential(SERVICE, "email", creds.email),
    storeCredential(SERVICE, "api_token", creds.apiToken),
    storeCredential(SERVICE, "site_url", creds.siteUrl),
  ]);
}

/** Clear stored credentials */
export async function clearCredentials(): Promise<void> {
  await Promise.all([
    deleteCredential(SERVICE, "email"),
    deleteCredential(SERVICE, "api_token"),
    deleteCredential(SERVICE, "site_url"),
  ]);
}

/** Create a credential getter for the AtlassianClient */
export function createCredentialGetter(): () => Promise<JiraCredentials> {
  return async () => {
    const creds = await loadCredentials();
    if (!creds) {
      throw new Error(
        "Jira credentials not found. Please configure Jira in the setup wizard.",
      );
    }
    return creds;
  };
}

/** Check if Jira is authenticated (credentials exist in keychain) */
export async function isJiraAuthenticated(): Promise<boolean> {
  return (await loadCredentials()) !== null;
}
