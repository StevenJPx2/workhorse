/**
 * AttachmentService - Manages downloaded attachments from external sources.
 *
 * Attachments are stored in: ~/.local/share/workhorse/attachments/{repo}/{issueId}/
 * This keeps them out of the repository and organized by issue.
 *
 * @module workhorse-core/services/attachment
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type { DownloadOptions, StoredAttachment } from "./types.ts";

export class AttachmentService {
  private readonly baseDir: string;

  constructor(attachmentsDir: string) {
    this.baseDir = attachmentsDir;
  }

  /** Get the directory path for an issue's attachments */
  getIssueDir(repoIdentifier: string, issueId: string): string {
    // Sanitize repo identifier (replace slashes with dashes for owner/repo format)
    const safeRepo = repoIdentifier.replace(/[/\\]/g, "-").replace(/[^a-zA-Z0-9-_.]/g, "_");
    return join(this.baseDir, safeRepo, issueId);
  }

  /** Ensure the directory exists for an issue */
  private ensureDir(repoIdentifier: string, issueId: string): string {
    const dir = this.getIssueDir(repoIdentifier, issueId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /** Generate a unique filename to avoid conflicts.
   *  Format: {sourceId}_{originalName} - uses underscore to separate ID from name */
  private generateFilename(sourceId: string, originalFilename: string): string {
    const ext = originalFilename.includes(".") ? `.${originalFilename.split(".").pop()}` : "";
    const baseName = basename(originalFilename, ext).slice(0, 50); // Limit name length
    return `${sourceId}_${baseName}${ext}`;
  }

  /** Store an attachment from a buffer */
  async store(
    repoIdentifier: string,
    issueId: string,
    content: Buffer,
    options: DownloadOptions,
  ): Promise<StoredAttachment> {
    const dir = this.ensureDir(repoIdentifier, issueId);
    const filename = this.generateFilename(options.sourceId, options.filename);
    const localPath = join(dir, filename);

    writeFileSync(localPath, content);

    return {
      sourceId: options.sourceId,
      source: options.source,
      filename: options.filename,
      mimeType: options.mimeType,
      size: options.size,
      localPath,
      downloadedAt: new Date().toISOString(),
      originalUrl: options.originalUrl,
    };
  }

  /** Check if an attachment is already downloaded */
  async exists(repoIdentifier: string, issueId: string, sourceId: string): Promise<string | null> {
    const dir = this.getIssueDir(repoIdentifier, issueId);
    if (!existsSync(dir)) return null;

    const files = await readdir(dir);
    const match = files.find((f) => f.startsWith(`${sourceId}_`));
    return match ? join(dir, match) : null;
  }

  /** Get attachment content by path */
  async getContent(localPath: string): Promise<Buffer> {
    return readFile(localPath);
  }

  /** List all attachments for an issue */
  async listForIssue(repoIdentifier: string, issueId: string): Promise<StoredAttachment[]> {
    const dir = this.getIssueDir(repoIdentifier, issueId);
    if (!existsSync(dir)) return [];

    const files = await readdir(dir);
    const attachments: StoredAttachment[] = [];

    for (const file of files) {
      const localPath = join(dir, file);
      const stats = await stat(localPath);

      // Parse sourceId from filename (format: {sourceId}_{originalName})
      const firstUnderscore = file.indexOf("_");
      const sourceId = firstUnderscore > 0 ? file.slice(0, firstUnderscore) : file;

      attachments.push({
        sourceId,
        source: "unknown", // Would need metadata file to track this
        filename: file,
        mimeType: guessMimeType(file),
        size: stats.size,
        localPath,
        downloadedAt: stats.mtime.toISOString(),
      });
    }

    return attachments;
  }

  /** Delete an attachment */
  async delete(localPath: string): Promise<void> {
    if (existsSync(localPath)) {
      await unlink(localPath);
    }
  }

  /** Delete all attachments for an issue */
  async deleteForIssue(repoIdentifier: string, issueId: string): Promise<number> {
    const attachments = await this.listForIssue(repoIdentifier, issueId);
    for (const attachment of attachments) {
      await this.delete(attachment.localPath);
    }
    return attachments.length;
  }
}

/** Guess MIME type from filename extension */
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    xml: "application/xml",
    zip: "application/zip",
  };
  return mimeTypes[ext] ?? "application/octet-stream";
}
