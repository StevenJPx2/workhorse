/**
 * AtlassianClient - Jira Cloud REST API client.
 *
 * Uses direct fetch calls (via Bun) with Basic Auth (email:apiToken).
 *
 * @module workhorse-plugin-jira/client
 */
import { markdownToAdf } from "marklassian";
import { createRateLimitChecker, parseRetryAfter } from "workhorse-core";

import type {
  JiraAttachment,
  JiraCredentials,
  JiraIssue,
  JiraTransition,
} from "./types.ts";

export const isRateLimitError = createRateLimitChecker([
  "429",
  "rate limit",
  "too many requests",
]);

function throwApiError(response: Response): never {
  const error = new Error(
    `Jira API error: ${response.status} ${response.statusText}`,
  ) as Error & { retryAfterMs?: number };

  if (response.status === 429) {
    error.retryAfterMs = parseRetryAfter(response.headers);
  }

  throw error;
}

export class AtlassianClient {
  private readonly getCredentials: () => Promise<JiraCredentials>;

  constructor(getCredentials: () => Promise<JiraCredentials>) {
    this.getCredentials = getCredentials;
  }

  private async getBaseUrl(): Promise<string> {
    return this.getCredentials().then(
      (creds) =>
        `https://${creds.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/rest/api/3`,
    );
  }

  private async headers(): Promise<Record<string, string>> {
    const { email, apiToken } = await this.getCredentials();
    return {
      Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${await this.getBaseUrl()}${path}`, {
      method: "GET",
      headers: await this.headers(),
    });

    if (!response.ok) throwApiError(response);

    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${await this.getBaseUrl()}${path}`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) throwApiError(response);

    return response.json() as Promise<T>;
  }

  private async put(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${await this.getBaseUrl()}${path}`, {
      method: "PUT",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) throwApiError(response);
  }

  async fetchIssue(ticketKey: string): Promise<JiraIssue> {
    return this.get<JiraIssue>(
      `/issue/${encodeURIComponent(ticketKey)}?fields=*all,-attachment`,
    );
  }

  async fetchIssueWithAttachments(ticketKey: string): Promise<JiraIssue> {
    return this.get<JiraIssue>(
      `/issue/${encodeURIComponent(ticketKey)}?fields=*all`,
    );
  }

  async getAttachments(ticketKey: string): Promise<JiraAttachment[]> {
    return this.fetchIssueWithAttachments(ticketKey).then(
      (r) => r.fields.attachment ?? [],
    );
  }

  async downloadAttachment(contentUrl: string): Promise<Buffer> {
    const { email, apiToken } = await this.getCredentials();
    const response = await fetch(contentUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download attachment: ${response.status} ${response.statusText}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async addComment(
    ticketKey: string,
    body: string,
    replyToId?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      body: markdownToAdf(body),
    };
    if (replyToId) {
      payload.properties = [
        { key: "sd.public.comment", value: { internal: false } },
      ];
      payload.parentId = replyToId;
    }
    await this.post(`/issue/${encodeURIComponent(ticketKey)}/comment`, payload);
  }

  async getTransitions(ticketKey: string): Promise<JiraTransition[]> {
    return await this.get<{ transitions: JiraTransition[] }>(
      `/issue/${encodeURIComponent(ticketKey)}/transitions`,
    ).then((r) => r.transitions);
  }

  async transitionIssue(
    ticketKey: string,
    transitionId: string,
  ): Promise<void> {
    await this.post(`/issue/${encodeURIComponent(ticketKey)}/transitions`, {
      transition: { id: transitionId },
    });
  }

  async editIssue(
    ticketKey: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.put(`/issue/${encodeURIComponent(ticketKey)}`, { fields });
  }

  async getCurrentUser(): Promise<{ accountId: string; displayName: string }> {
    return this.get<{ accountId: string; displayName: string }>("/myself");
  }
}
