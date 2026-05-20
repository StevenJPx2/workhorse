/**
 * GitHub attachment downloading - fetches and stores images via AttachmentService.
 *
 * @module workhorse-plugin-github/attachment-download
 */

import type { AttachmentService, StoredAttachment } from "workhorse-core";

import type { GitHubAttachment } from "./types.ts";

/** Download an image from a URL */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Workhorse-GitHub-Plugin/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Result of downloading attachments */
export interface AttachmentDownloadResult {
  /** Successfully downloaded attachments */
  downloaded: StoredAttachment[];
  /** Attachments that were already cached */
  cached: string[];
  /** Attachments that failed to download */
  failed: Array<{ url: string; error: string }>;
}

/** Download all attachments and store via AttachmentService */
export async function downloadAttachments(
  attachmentService: AttachmentService,
  repoIdentifier: string,
  issueId: string,
  attachments: GitHubAttachment[],
): Promise<AttachmentDownloadResult> {
  const result: AttachmentDownloadResult = {
    downloaded: [],
    cached: [],
    failed: [],
  };

  for (const att of attachments) {
    // Check if already downloaded
    const existingPath = await attachmentService.exists(repoIdentifier, issueId, att.id);
    if (existingPath) {
      result.cached.push(existingPath);
      continue;
    }

    try {
      const content = await downloadImage(att.url);
      const stored = await attachmentService.store(repoIdentifier, issueId, content, {
        source: "github",
        sourceId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: content.length,
        originalUrl: att.url,
      });
      result.downloaded.push(stored);
    } catch (error) {
      result.failed.push({
        url: att.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
