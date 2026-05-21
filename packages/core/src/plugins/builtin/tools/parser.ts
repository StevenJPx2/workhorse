/**
 * Local parser - fallback parser for free-form text input.
 *
 * When no other parser matches (e.g., not a Jira key or GitHub issue),
 * this parser creates a local issue from the user's input text.
 *
 * @module plugins/builtin/local-parser
 */

import type { IssueParserOptions, ParsedIssue } from "#workflow";

/**
 * Create parser options for the local fallback parser.
 *
 * This parser:
 * - Always returns true for canParse (it's a fallback)
 * - Creates a local issue with the input as title/description
 * - Should be registered LAST so other parsers get priority
 */
export function createLocalParserOptions(): IssueParserOptions {
  return {
    source: "local",

    // Always matches - this is the fallback parser
    canParse: (_input: string) => true,

    // Create a local issue from the input text
    parse: async (input: string): Promise<ParsedIssue> => {
      const trimmed = input.trim();
      // Extract title: first line or first 80 chars, truncated at word boundary
      const firstLine = trimmed.split("\n")[0]?.trim() ?? trimmed;
      let title = firstLine;
      if (firstLine.length > 80) {
        const truncated = firstLine.substring(0, 77);
        const lastSpace = truncated.lastIndexOf(" ");
        title = lastSpace > 40 ? `${truncated.substring(0, lastSpace)}...` : `${truncated}...`;
      }

      return {
        // Generate unique local ID: LOCAL-{timestamp}-{random}
        externalId: `LOCAL-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        source: "local",
        title,
        description: trimmed,
        issueType: "task",
        metadata: {
          createdAt: new Date().toISOString(),
          isLocal: true,
        },
      };
    },
  };
}
