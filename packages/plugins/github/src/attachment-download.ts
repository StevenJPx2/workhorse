/**
 * GitHub attachment downloading - fetches and stores images via AttachmentService.
 *
 * @module workhorse-plugin-github/attachment-download
 */
import { createHash } from "node:crypto";
import type { AttachmentService, StoredAttachment } from "workhorse-core";

import { downloadWithAuth } from "./gh-cli.ts";
import type { GitHubAttachment } from "./types.ts";

/**
 * Download an image from a URL.
 * Uses authenticated requests for github.com URLs (including user-attachments).
 */
export async function downloadImage(url: string): Promise<Buffer> {
  return downloadWithAuth(url);
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
    const existingPath = await attachmentService.exists(
      repoIdentifier,
      issueId,
      att.id,
    );
    if (existingPath) {
      result.cached.push(existingPath);
      continue;
    }

    try {
      const content = await downloadImage(att.url);
      const stored = await attachmentService.store(
        repoIdentifier,
        issueId,
        content,
        {
          source: "github",
          sourceId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: content.length,
          originalUrl: att.url,
        },
      );
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

/** Result of downloading a direct URL */
export interface DirectUrlDownloadResult {
  success: boolean;
  output?: string;
  error?: string;
}

/** Download a single image from a direct URL */
export async function downloadDirectUrl(
  attachmentService: AttachmentService,
  issueId: string,
  url: string,
): Promise<DirectUrlDownloadResult> {
  const urlHash = createHash("md5").update(url).digest("hex").slice(0, 12);

  // Use "direct" as repo identifier for direct URL downloads
  const repoIdentifier = "direct-download";

  // Check if already downloaded
  const existingPath = await attachmentService.exists(
    repoIdentifier,
    issueId,
    urlHash,
  );
  if (existingPath) {
    return {
      success: true,
      output: JSON.stringify({
        message: "Image already downloaded",
        localPath: existingPath,
        cached: true,
      }),
    };
  }

  // Download the image with authentication
  const content = await downloadImage(url);

  // Store it
  const stored = await attachmentService.store(
    repoIdentifier,
    issueId,
    content,
    {
      source: "github",
      sourceId: urlHash,
      filename: `github-image-${urlHash}.png`,
      mimeType: "image/png", // Default, could be improved with content-type detection
      size: content.length,
      originalUrl: url,
    },
  );

  return {
    success: true,
    output: JSON.stringify({
      message: "Image downloaded successfully",
      localPath: stored.localPath,
      filename: stored.filename,
      size: stored.size,
      originalUrl: url,
    }),
  };
}
