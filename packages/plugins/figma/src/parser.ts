/**
 * Figma URL parsing utilities.
 *
 * These functions extract file keys and node IDs from Figma URLs.
 * They are used by cross-plugin.ts to detect Figma links in other issues
 * (e.g., Jira tickets) and fetch design context.
 *
 * Note: This module does NOT provide a Tracker parser. Figma URLs are design
 * references, not tasks. The parsing utilities here are for link detection only.
 *
 * Supported URL forms:
 *   https://www.figma.com/file/<key>/<name>
 *   https://www.figma.com/file/<key>/<name>?node-id=<nodeId>
 *   https://www.figma.com/design/<key>/<name>
 *   https://www.figma.com/design/<key>/<name>?node-id=<nodeId>
 *   https://www.figma.com/proto/<key>/<name>
 *
 * @module workhorse-plugin-figma/parser
 */

import type { FigmaRef } from "./types.ts";

/**
 * Regex for any figma.com URL that contains a file/design/proto key.
 * Capture groups:
 *   1 - "file" | "design" | "proto"
 *   2 - file key (alphanumeric)
 *   3 - optional URL-encoded file name slug
 */
const FIGMA_URL_REGEX =
  /https?:\/\/(?:www\.)?figma\.com\/(file|design|proto)\/([a-zA-Z0-9]+)(?:\/([^?#]*))?/;

/** Check whether an input string looks like a Figma URL */
export function canParseFigma(input: string): boolean {
  return FIGMA_URL_REGEX.test(input.trim());
}

/**
 * Extract a FigmaRef from a Figma URL.
 * Returns null when the URL doesn't match the expected format.
 */
export function extractFigmaRef(url: string): FigmaRef | null {
  const match = url.trim().match(FIGMA_URL_REGEX);
  if (!match) return null;

  const fileKey = match[2] as string; // capture group 2 always exists when match succeeds
  const rawSlug = match[3] as string | undefined;

  // Extract node-id query param if present
  let nodeId: string | undefined;
  try {
    const raw = new URL(url.trim()).searchParams.get("node-id");
    if (raw) {
      // Figma encodes colons as hyphens in the URL, normalise to "x:y" form
      nodeId = raw.replace(/-/g, ":");
    }
  } catch {
    // Not a valid URL — skip node extraction
  }

  // Canonical URL: strip query/hash for file-level, keep node-id for frame-level
  return {
    fileKey,
    nodeId,
    displayName: rawSlug ? decodeURIComponent(rawSlug.replace(/-/g, " ")) : undefined,
    url: nodeId
      ? `https://www.figma.com/file/${fileKey}/${rawSlug ?? ""}?node-id=${nodeId}`
      : `https://www.figma.com/file/${fileKey}/${rawSlug ?? ""}`,
  };
}
