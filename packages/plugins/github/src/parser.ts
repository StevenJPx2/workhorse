/**
 * GitHub issue/PR parser for the Tracker.
 *
 * Matches:
 * - Short form: `owner/repo#45`
 * - Issue URLs: `https://github.com/owner/repo/issues/45`
 * - PR URLs: `https://github.com/owner/repo/pull/45`
 *
 * @module @stevenjpx2/jiratown-plugin-github/parser
 */

import type { IssueParserOptions } from "workhorse-core";
import type { GitHubClient } from "./client.ts";
import { mapGitHubToIssue } from "./mapper.ts";
import type { GitHubRef } from "./types.ts";

/** Regex for matching short form: owner/repo#45 */
const GITHUB_SHORT_REGEX = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/;

/** Regex for matching GitHub URLs */
const GITHUB_URL_REGEX =
  /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(issues|pull)\/(\d+)/;

/** Parse input into a GitHubRef, or null if not a GitHub reference */
export function parseGitHubRef(input: string): GitHubRef | null {
  const trimmed = input.trim();

  // Try short form first: owner/repo#45
  const shortMatch = trimmed.match(GITHUB_SHORT_REGEX);
  if (shortMatch?.[1] && shortMatch[2] && shortMatch[3]) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: Number.parseInt(shortMatch[3], 10),
      type: "issue", // We'll determine actual type when fetching
    };
  }

  // Try URL form
  const urlMatch = trimmed.match(GITHUB_URL_REGEX);
  if (urlMatch?.[1] && urlMatch[2] && urlMatch[3] && urlMatch[4]) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: Number.parseInt(urlMatch[4], 10),
      type: urlMatch[3] === "pull" ? "pull" : "issue",
    };
  }

  return null;
}

/** Check if input looks like a GitHub reference or URL */
export function canParseGitHub(input: string): boolean {
  return parseGitHubRef(input) !== null;
}

/** Create parser options for registering with the Tracker */
export function createGitHubParserOptions(client: GitHubClient): IssueParserOptions {
  return {
    source: "github",
    canParse: canParseGitHub,
    parse: async (input: string) => {
      const ref = parseGitHubRef(input);
      if (!ref) {
        throw new Error(`Could not parse GitHub reference from: "${input}"`);
      }

      // Fetch the issue/PR and map to ParsedIssue
      return mapGitHubToIssue(await client.fetchIssue(ref.owner, ref.repo, ref.number));
    },
  };
}
