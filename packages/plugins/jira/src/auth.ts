/**
 * Jira API Token authentication.
 *
 * Credentials can be provided via:
 * 1. Environment variables (preferred for CI/automation):
 *    - JIRA_EMAIL: Your Atlassian account email
 *    - JIRA_API_TOKEN: API token from https://id.atlassian.com/manage-profile/security/api-tokens
 *    - JIRA_SITE_URL: Your Jira site (e.g., yourcompany.atlassian.net)
 * 2. System keychain (set via TUI setup wizard)
 *
 * Environment variables take precedence over keychain.
 *
 * @module workhorse-plugin-jira/auth
 */

import {
  clearCredentials,
  isJiraAuthenticated,
  resolveEnvVar,
  saveCredentials,
} from "./credentials.ts";

/**
 * Jira auth configuration for the setup wizard.
 * Returns the fields needed to configure Jira API token auth.
 */
export function getJiraAuthFields() {
  return [
    {
      key: "siteUrl",
      label: "Jira Site URL",
      description: "Your Atlassian site (e.g., yourcompany.atlassian.net) or $ENV_VAR",
      required: true,
      placeholder: "yourcompany.atlassian.net",
    },
    {
      key: "email",
      label: "Email",
      description: "Your Atlassian account email address or $ENV_VAR",
      required: true,
      placeholder: "you@example.com",
    },
    {
      key: "apiToken",
      label: "API Token",
      description: "Token value or $ENV_VAR (e.g., $ATLASSIAN_API_KEY)",
      required: true,
      secret: true,
      placeholder: "$ATLASSIAN_API_KEY",
    },
  ];
}

/**
 * Validate and save Jira credentials.
 * Called by the setup wizard after user enters credentials.
 * Accepts Record<string, string> to match ApiTokenProvider interface.
 *
 * Values can be env var references (e.g., "$ATLASSIAN_API_KEY").
 * The reference is stored in keychain, NOT the resolved value.
 * This keeps secrets safe - they're only resolved at runtime.
 */
export async function configureJiraAuth(
  values: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const { email: rawEmail, apiToken: rawApiToken, siteUrl: rawSiteUrl } = values;

  if (!rawEmail || !rawApiToken || !rawSiteUrl) {
    return { success: false, error: "All fields are required" };
  }

  // Resolve env var references for validation (but we'll store the references)
  const email = resolveEnvVar(rawEmail);
  const apiToken = resolveEnvVar(rawApiToken);
  let siteUrl = resolveEnvVar(rawSiteUrl);

  if (!email)
    return { success: false, error: `Environment variable ${rawEmail.slice(1)} not found` };
  if (!apiToken)
    return { success: false, error: `Environment variable ${rawApiToken.slice(1)} not found` };
  if (!siteUrl)
    return { success: false, error: `Environment variable ${rawSiteUrl.slice(1)} not found` };

  // Normalize siteUrl - remove protocol if present
  siteUrl = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Also normalize the raw siteUrl if it's not an env var reference
  const normalizedRawSiteUrl = rawSiteUrl.startsWith("$")
    ? rawSiteUrl
    : rawSiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Test the credentials by making a simple API call
  try {
    const response = await fetch(`https://${siteUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: "Invalid email or API token" };
      if (response.status === 404)
        return { success: false, error: "Jira site not found. Check your site URL." };
      return { success: false, error: `Jira API error: ${response.status}` };
    }

    // Credentials are valid, save the RAW values (which may be env var references)
    await saveCredentials({
      email: rawEmail,
      apiToken: rawApiToken,
      siteUrl: normalizedRawSiteUrl,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("fetch")) {
      return { success: false, error: "Could not connect to Jira. Check your site URL." };
    }
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Jira auth provider for the plugin system.
 * Uses "apitoken" type which the TUI handles via the setup wizard.
 */
export const jiraAuthProvider = {
  type: "apitoken" as const,
  isAuthenticated: isJiraAuthenticated,
  getFields: getJiraAuthFields,
  configure: configureJiraAuth,
  clearTokens: clearCredentials,
};
