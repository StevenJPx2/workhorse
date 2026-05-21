/**
 * Atlassian Document Format (ADF) utilities.
 *
 * ADF is a JSON-based document format used by Jira and Confluence.
 * These utilities extract plain text and links from ADF content.
 *
 * @module workhorse-plugin-jira/adf
 */

/**
 * Extract plain text from Jira description (handles Atlassian Document Format).
 * For string input, returns as-is. For ADF object, recursively extracts text nodes.
 */
export function extractDescription(description: unknown): string {
  if (typeof description === "string") return description;
  if (description === null || description === undefined) return "";

  if (typeof description === "object") {
    const obj = description as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      return extractTextFromAdfNodes(obj.content);
    }
  }

  return String(description);
}

/** Recursively extract text from ADF content nodes */
// oxlint-disable-next-line workhorse/no-single-reference-function -- recursive function
function extractTextFromAdfNodes(nodes: unknown[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;

    const n = node as Record<string, unknown>;

    if (typeof n.text === "string") {
      parts.push(n.text);
    } else if (Array.isArray(n.content)) {
      parts.push(extractTextFromAdfNodes(n.content));
    }
  }

  return parts.join("\n");
}

/**
 * Extract links from ADF content.
 *
 * In ADF, links appear as text nodes with a "link" mark:
 * ```json
 * { "type": "text", "text": "link text", "marks": [{ "type": "link", "attrs": { "href": "..." } }] }
 * ```
 */
export function extractLinksFromAdf(
  adf: unknown,
): Array<{ text: string; href: string }> {
  if (adf === null || adf === undefined) return [];

  // Handle plain string — extract URLs with regex
  if (typeof adf === "string") {
    return extractLinksFromPlainText(adf);
  }

  if (typeof adf !== "object") return [];

  const obj = adf as Record<string, unknown>;
  const links: Array<{ text: string; href: string }> = [];

  // Check if this is a text node with link marks
  const extractedLink = extractLinkFromTextNode(obj);
  if (extractedLink) {
    links.push(extractedLink);
  }

  // Recurse into content arrays
  if (Array.isArray(obj.content)) {
    for (const child of obj.content) {
      links.push(...extractLinksFromAdf(child));
    }
  }

  return links;
}

/** Extract URLs from plain text using regex */
function extractLinksFromPlainText(
  text: string,
): Array<{ text: string; href: string }> {
  const matches = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g);
  if (!matches) return [];

  return matches.map((href) => ({ text: href, href }));
}

/** Extract a link from an ADF text node with link marks */
function extractLinkFromTextNode(
  node: Record<string, unknown>,
): { text: string; href: string } | null {
  if (typeof node.text !== "string" || !Array.isArray(node.marks)) return null;

  for (const mark of node.marks as unknown[]) {
    if (typeof mark !== "object" || mark === null) continue;

    const m = mark as Record<string, unknown>;
    const isLinkMark = m.type === "link";
    const attrs = m.attrs as Record<string, unknown> | undefined;
    const href = attrs?.href;

    if (isLinkMark && typeof href === "string") {
      return { text: node.text as string, href };
    }
  }

  return null;
}
