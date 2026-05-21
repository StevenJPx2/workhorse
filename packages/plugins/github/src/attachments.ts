/**
 * GitHub attachment handling - extracts images from markdown content.
 *
 * Extracts image URLs from GitHub issue/PR bodies and comments.
 * For downloading, see attachment-download.ts.
 *
 * @module workhorse-plugin-github/attachments
 */
import { createHash } from "node:crypto";

import type { GitHubAttachment, GitHubComment } from "./types.ts";

/** Regex patterns for extracting images from markdown */
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HTML_IMG_REGEX = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

/** Common GitHub image hosting domains */
const GITHUB_IMAGE_DOMAINS = [
  "user-images.githubusercontent.com",
  "github.githubassets.com",
  "avatars.githubusercontent.com",
  "raw.githubusercontent.com",
  "camo.githubusercontent.com",
  "private-user-images.githubusercontent.com",
];

/** URL paths that indicate GitHub user-uploaded content (no extension needed) */
const GITHUB_USER_CONTENT_PATHS = ["/user-attachments/assets/"];

/** Generate a stable ID from a URL */
function hashUrl(url: string): string {
  return createHash("md5").update(url).digest("hex").slice(0, 12);
}

/** Guess MIME type from URL */
function guessMimeType(url: string): string {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg"))
    return "image/jpeg";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  // Default for GitHub user-content images (usually PNG)
  return "image/png";
}

/** Extract filename from URL */
function extractFilename(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/");
    const lastSegment = segments[segments.length - 1] || "image";
    // Handle GitHub's UUID-style filenames
    if (lastSegment.includes("-") && lastSegment.length > 30) {
      return `github-image-${hashUrl(url)}.png`;
    }
    return lastSegment;
  } catch {
    return `image-${hashUrl(url)}.png`;
  }
}

/** Check if URL is an image we should download */
function isDownloadableImage(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Accept GitHub-hosted images from CDN subdomains
    if (GITHUB_IMAGE_DOMAINS.some((d) => parsedUrl.hostname.includes(d))) {
      return true;
    }
    // Accept GitHub user-attachments URLs (github.com/user-attachments/assets/...)
    // These are uploaded images that don't have file extensions
    if (
      parsedUrl.hostname === "github.com" &&
      GITHUB_USER_CONTENT_PATHS.some((p) => parsedUrl.pathname.startsWith(p))
    ) {
      return true;
    }
    // Accept common image extensions from any source
    return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(
      parsedUrl.pathname.toLowerCase().split(".").pop() || "",
    );
  } catch {
    return false;
  }
}

/** Extract image references from markdown text */
export function extractImagesFromMarkdown(
  markdown: string | null,
  source: string,
): GitHubAttachment[] {
  if (!markdown) return [];

  const attachments: GitHubAttachment[] = [];
  const seenUrls = new Set<string>();

  // Extract markdown images: ![alt](url)
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(markdown)) !== null) {
    const [, alt, url] = match;
    if (url && !seenUrls.has(url) && isDownloadableImage(url)) {
      seenUrls.add(url);
      attachments.push({
        id: hashUrl(url),
        url,
        alt: alt || undefined,
        source,
        mimeType: guessMimeType(url),
        filename: extractFilename(url),
      });
    }
  }

  // Extract HTML images: <img src="url">
  while ((match = HTML_IMG_REGEX.exec(markdown)) !== null) {
    const [, url] = match;
    if (url && !seenUrls.has(url) && isDownloadableImage(url)) {
      seenUrls.add(url);
      attachments.push({
        id: hashUrl(url),
        url,
        source,
        mimeType: guessMimeType(url),
        filename: extractFilename(url),
      });
    }
  }

  return attachments;
}

/** Extract all image attachments from an issue/PR body and comments */
export function extractAllAttachments(
  body: string | null,
  comments: GitHubComment[],
): GitHubAttachment[] {
  const attachments: GitHubAttachment[] = [];

  // Extract from body
  attachments.push(...extractImagesFromMarkdown(body, "body"));

  // Extract from comments
  for (const comment of comments) {
    attachments.push(
      ...extractImagesFromMarkdown(comment.body, `comment-${comment.id}`),
    );
  }

  return attachments;
}

/** Filter to only image attachments */
export function filterImageAttachments(
  attachments: GitHubAttachment[],
): GitHubAttachment[] {
  return attachments.filter((a) => a.mimeType.startsWith("image/"));
}

/** Count images in markdown text (quick check without full extraction) */
export function countImagesInMarkdown(markdown: string | null): number {
  if (!markdown) return 0;
  return extractImagesFromMarkdown(markdown, "count").length;
}
