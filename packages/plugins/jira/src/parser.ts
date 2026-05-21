/**
 * Jira issue parser for the Tracker.
 *
 * Matches Jira ticket keys (e.g., AM-123, PROJ-456) and Jira URLs.
 *
 * @module workhorse-plugin-jira/parser
 */
import type { HookEmitter, IssueParserOptions } from "workhorse-core";

import type { AtlassianClient } from "./client.ts";
import { type ExtractedLink, mapJiraToIssue } from "./mapper.ts";

/** Regex for matching Jira ticket keys like AM-123, PROJ-456 */
const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]*-\d+$/;

/** Regex for matching Jira URLs */
const JIRA_URL_REGEX =
  /https:\/\/[a-z0-9-]+\.atlassian\.net\/browse\/[A-Z][A-Z0-9]*-\d+/;

/** Check if input looks like a Jira ticket key or URL */
export function canParseJira(input: string): boolean {
  const trimmed = input.trim();
  return JIRA_KEY_REGEX.test(trimmed) || JIRA_URL_REGEX.test(trimmed);
}

/** Create parser options for registering with the Tracker */
export function createJiraParserOptions(
  client: AtlassianClient,
  hooks?: HookEmitter,
): IssueParserOptions {
  return {
    source: "jira",
    canParse: canParseJira,
    parse: async (input: string) => {
      const trimmed = input.trim();
      const ticketKey = JIRA_URL_REGEX.test(trimmed)
        ? (trimmed.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/)?.[1] ?? null)
        : trimmed;

      if (!ticketKey) {
        throw new Error(`Could not extract Jira ticket key from: "${trimmed}"`);
      }

      const parsed = mapJiraToIssue(await client.fetchIssue(ticketKey));

      // Emit issue.links.discovered if links were found
      const links = parsed.metadata.links as ExtractedLink[] | undefined;
      if (hooks && links && links.length > 0) {
        hooks.emit("issue.links.discovered", {
          issue: parsed,
          links,
        });
      }

      return parsed;
    },
  };
}
