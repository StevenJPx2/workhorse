/**
 * GitHub MCP Client - API methods for interacting with GitHub via MCP
 *
 * Uses the same mcp-remote pattern as the Atlassian client.
 * Authentication is handled by GitHub OAuth through mcp-remote.
 */

import type {
  GitHubPullRequest,
  GitHubReviewComment,
  GitHubPRReview,
  CreateReviewParams,
  GitHubClient as GitHubClientInterface,
  McpToolResultContent,
} from "./types.ts";
import {
  mapPullRequest,
  mapReviewComment,
  mapPRReview,
  parseMcpResponse,
  extractTextContent,
} from "./mappers.ts";
import { GitHubConnection } from "./github-connection.ts";

export class GitHubClient extends GitHubConnection implements GitHubClientInterface {
  async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name: "get_pull_request",
      arguments: { owner, repo, pull_number: number },
    });

    const content = result.content as McpToolResultContent[];
    const text = extractTextContent(content);
    const raw = parseMcpResponse(text) as Record<string, unknown>;

    if (!raw.number && !raw.title) {
      throw new Error(`Pull request #${number} not found in ${owner}/${repo}`);
    }

    return mapPullRequest(raw as Parameters<typeof mapPullRequest>[0]);
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: "open" | "closed" | "all" = "open",
  ): Promise<GitHubPullRequest[]> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name: "list_pull_requests",
      arguments: { owner, repo, state },
    });

    const content = result.content as McpToolResultContent[];
    const text = extractTextContent(content);
    const raw = parseMcpResponse(text);

    const items = Array.isArray(raw) ? raw : [raw];
    return items.map((item: unknown) =>
      mapPullRequest(item as Parameters<typeof mapPullRequest>[0]),
    );
  }

  async listReviewComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubReviewComment[]> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name: "get_pull_request_reviews",
      arguments: { owner, repo, pull_number: number },
    });

    const content = result.content as McpToolResultContent[];
    const text = extractTextContent(content);
    const raw = parseMcpResponse(text);

    const items = Array.isArray(raw) ? raw : [raw];
    return items
      .filter((item: unknown) => item !== null && typeof item === "object")
      .map((item: unknown) => mapReviewComment(item as Parameters<typeof mapReviewComment>[0]));
  }

  async listReviews(owner: string, repo: string, number: number): Promise<GitHubPRReview[]> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name: "get_pull_request_reviews",
      arguments: { owner, repo, pull_number: number },
    });

    const content = result.content as McpToolResultContent[];
    const text = extractTextContent(content);
    const raw = parseMcpResponse(text);

    const items = Array.isArray(raw) ? raw : [raw];
    return items
      .filter((item: unknown) => item !== null && typeof item === "object")
      .map((item: unknown) => mapPRReview(item as Parameters<typeof mapPRReview>[0]));
  }

  async createReview(
    owner: string,
    repo: string,
    number: number,
    params: CreateReviewParams,
  ): Promise<void> {
    this.ensureConnected();

    const comments = params.comments?.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      ...(c.side && { side: c.side }),
    }));

    await this.client!.callTool({
      name: "create_pull_request_review",
      arguments: {
        owner,
        repo,
        pull_number: number,
        body: params.body,
        event: params.event,
        ...(comments && comments.length > 0 && { comments }),
      },
    });
  }

  async createReviewComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
    inReplyTo?: number,
  ): Promise<void> {
    this.ensureConnected();

    await this.client!.callTool({
      name: "create_pull_request_review",
      arguments: {
        owner,
        repo,
        pull_number: number,
        body,
        ...(inReplyTo && { in_reply_to: inReplyTo }),
      },
    });
  }
}

/**
 * Create a GitHub client instance
 */
export function createGitHubClient(): GitHubClient {
  return new GitHubClient();
}
