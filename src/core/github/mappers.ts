/**
 * GitHub MCP response mappers
 *
 * Transforms raw MCP tool responses into domain objects.
 */

import type { GitHubPullRequest, GitHubReviewComment, GitHubPRReview } from "./types.ts";

/**
 * Raw PR response from GitHub MCP
 */
interface RawPullRequest {
  number?: number;
  title?: string;
  body?: string | null;
  state?: string;
  draft?: boolean;
  head?: { ref?: string };
  base?: { ref?: string };
  html_url?: string;
  user?: { login?: string };
  created_at?: string;
  updated_at?: string;
  mergeable_state?: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

/**
 * Raw review comment response from GitHub MCP
 */
interface RawReviewComment {
  id?: number;
  pull_request_review_id?: number | null;
  user?: { login?: string };
  body?: string;
  path?: string | null;
  line?: number | null;
  original_line?: number | null;
  side?: string | null;
  is_obsolete?: boolean;
  created_at?: string;
  updated_at?: string;
  in_reply_to_id?: number | null;
}

/**
 * Raw review response from GitHub MCP
 */
interface RawPRReview {
  id?: number;
  user?: { login?: string };
  state?: string;
  body?: string;
  submitted_at?: string;
}

export function mapPullRequest(raw: RawPullRequest): GitHubPullRequest {
  return {
    number: raw.number ?? 0,
    title: raw.title ?? "",
    body: raw.body ?? null,
    state: (raw.state as GitHubPullRequest["state"]) ?? "open",
    draft: raw.draft ?? false,
    headBranch: raw.head?.ref ?? "",
    baseBranch: raw.base?.ref ?? "",
    url: raw.html_url ?? "",
    author: raw.user?.login ?? "",
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? "",
    mergeableState: raw.mergeable_state ?? null,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    changedFiles: raw.changed_files ?? 0,
  };
}

export function mapReviewComment(raw: RawReviewComment): GitHubReviewComment {
  return {
    id: raw.id ?? 0,
    reviewId: raw.pull_request_review_id ?? null,
    user: raw.user?.login ?? "",
    body: raw.body ?? "",
    path: raw.path ?? null,
    line: raw.line ?? null,
    originalLine: raw.original_line ?? null,
    side: (raw.side as GitHubReviewComment["side"]) ?? null,
    isResolved: raw.is_obsolete ?? false,
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? "",
    inReplyToId: raw.in_reply_to_id ?? null,
  };
}

export function mapPRReview(raw: RawPRReview): GitHubPRReview {
  return {
    id: raw.id ?? 0,
    user: raw.user?.login ?? "",
    state: (raw.state as GitHubPRReview["state"]) ?? "PENDING",
    body: raw.body ?? "",
    submittedAt: raw.submitted_at ?? "",
  };
}

/**
 * Parse a text content from MCP tool result
 */
export function parseMcpResponse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Failed to parse GitHub MCP response: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`,
    );
  }
}

/**
 * Extract text content from MCP tool result
 */
export function extractTextContent(content: unknown[]): string {
  const items = content as Array<{ type?: string; text?: string }>;
  const textItem = items.find((c) => c.type === "text");
  if (!textItem?.text) {
    throw new Error("No text content in GitHub MCP response");
  }
  return textItem.text;
}
