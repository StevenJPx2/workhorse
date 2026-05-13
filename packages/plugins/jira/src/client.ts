/**
 * AtlassianClient - Jira Cloud REST API client.
 *
 * Uses direct fetch calls (via Bun) with Basic Auth (email:apiToken).
 *
 * @module workhorse-plugin-jira/client
 */

import type { JiraCredentials, JiraIssue, JiraTransition } from "./types.ts";

export class AtlassianClient {
  private readonly getCredentials: () => Promise<JiraCredentials>;

  constructor(getCredentials: () => Promise<JiraCredentials>) {
    this.getCredentials = getCredentials;
  }

  /** Get the base URL from credentials */
  private async getBaseUrl(): Promise<string> {
    const creds = await this.getCredentials();
    // Normalize siteUrl - ensure it has https:// and ends with the API path
    const siteUrl = creds.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${siteUrl}/rest/api/3`;
  }

  /** Build request headers with Basic Auth (email:apiToken) */
  private async headers(): Promise<Record<string, string>> {
    const creds = await this.getCredentials();
    const basicAuth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64");
    return {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  /** GET helper */
  private async get<T>(path: string): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: await this.headers(),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /** POST helper */
  private async post<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /** PUT helper */
  private async put(path: string, body: unknown): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }
  }

  /** Fetch a Jira issue by key */
  async fetchIssue(ticketKey: string): Promise<JiraIssue> {
    return this.get<JiraIssue>(`/issue/${encodeURIComponent(ticketKey)}?fields=*all,-attachment`);
  }

  /** Add a comment to an issue, optionally as a reply to another comment */
  async addComment(ticketKey: string, body: string, replyToId?: string): Promise<void> {
    const payload: Record<string, unknown> = { body };
    if (replyToId) {
      // Jira REST API v3 uses jsdPublic for comment properties including parent
      payload.properties = [{ key: "sd.public.comment", value: { internal: false } }];
      // For threaded replies, we need to use the comment property
      payload.parentId = replyToId;
    }
    await this.post(`/issue/${encodeURIComponent(ticketKey)}/comment`, payload);
  }

  /** Get available transitions for an issue */
  async getTransitions(ticketKey: string): Promise<JiraTransition[]> {
    return await this.get<{ transitions: JiraTransition[] }>(
      `/issue/${encodeURIComponent(ticketKey)}/transitions`,
    ).then((r) => r.transitions);
  }

  /** Transition an issue */
  async transitionIssue(ticketKey: string, transitionId: string): Promise<void> {
    await this.post(`/issue/${encodeURIComponent(ticketKey)}/transitions`, {
      transition: { id: transitionId },
    });
  }

  /** Edit issue fields */
  async editIssue(ticketKey: string, fields: Record<string, unknown>): Promise<void> {
    await this.put(`/issue/${encodeURIComponent(ticketKey)}`, { fields });
  }

  /** Get current user profile (using Jira's myself endpoint with Basic Auth) */
  async getCurrentUser(): Promise<{ accountId: string; displayName: string }> {
    return this.get<{ accountId: string; displayName: string }>("/myself");
  }
}
