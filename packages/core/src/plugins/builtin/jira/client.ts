/**
 * AtlassianClient - Jira Cloud REST API client.
 *
 * Uses direct fetch calls (via Bun) with Bearer token auth.
 *
 * @module plugins/builtin/jira/client
 */

import type { JiraCredentials, JiraIssue, JiraTransition } from "./types.ts";

export class AtlassianClient {
  private readonly baseUrl: string;

  constructor(
    cloudId: string,
    private readonly getCredentials: () => Promise<JiraCredentials>,
  ) {
    this.baseUrl = `https://${cloudId}.atlassian.net/rest/api/3`;
  }

  /** Build request headers with current access token */
  private async headers(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${(await this.getCredentials()).accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  /** GET helper */
  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
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
    const response = await fetch(`${this.baseUrl}${path}`, {
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
    const response = await fetch(`${this.baseUrl}${path}`, {
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

  /** Add a comment to an issue */
  async addComment(ticketKey: string, body: string): Promise<void> {
    await this.post(`/issue/${encodeURIComponent(ticketKey)}/comment`, { body });
  }

  /** Get available transitions for an issue */
  async getTransitions(ticketKey: string): Promise<JiraTransition[]> {
    return (
      await this.get<{ transitions: JiraTransition[] }>(
        `/issue/${encodeURIComponent(ticketKey)}/transitions`,
      )
    ).transitions;
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

  /** Get current user profile */
  async getCurrentUser(): Promise<{ accountId: string; displayName: string }> {
    const response = await fetch("https://api.atlassian.com/me", {
      headers: { Authorization: `Bearer ${(await this.getCredentials()).accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Atlassian API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<{ accountId: string; displayName: string }>;
  }
}
