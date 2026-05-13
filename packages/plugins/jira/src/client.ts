/**
 * AtlassianClient - Jira Cloud REST API client.
 *
 * Uses direct fetch calls (via Bun) with Basic Auth (email:apiToken).
 *
 * @module workhorse-plugin-jira/client
 */

import { markdownToAdf } from "marklassian";
import type { JiraCredentials, JiraIssue, JiraTransition } from "./types.ts";

export class AtlassianClient {
  private readonly getCredentials: () => Promise<JiraCredentials>;

  constructor(getCredentials: () => Promise<JiraCredentials>) {
    this.getCredentials = getCredentials;
  }

  /** Get the base URL from credentials */
  private async getBaseUrl(): Promise<string> {
    return this.getCredentials().then(
      (creds) =>
        `https://${creds.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/rest/api/3`,
    );
  }

  /** Build request headers with Basic Auth (email:apiToken) */
  private async headers(): Promise<Record<string, string>> {
    const { email, apiToken } = await this.getCredentials();
    return {
      Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  /** GET helper */
  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${await this.getBaseUrl()}${path}`, {
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
    const response = await fetch(`${await this.getBaseUrl()}${path}`, {
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
    const response = await fetch(`${await this.getBaseUrl()}${path}`, {
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

  /** Add a comment to an issue, optionally as a reply to another comment.
   *  The body is markdown; it is converted to Atlassian Document Format (ADF)
   *  automatically because Jira REST API v3 requires ADF for comment bodies. */
  async addComment(ticketKey: string, body: string, replyToId?: string): Promise<void> {
    const payload: Record<string, unknown> = {
      body: markdownToAdf(body),
    };
    if (replyToId) {
      payload.properties = [{ key: "sd.public.comment", value: { internal: false } }];
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
