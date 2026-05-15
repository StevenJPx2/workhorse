/**
 * Types for the attachment service.
 *
 * @module workhorse-core/services/attachment
 */

/** Metadata for a stored attachment */
export interface StoredAttachment {
  /** Original source ID (e.g., Jira attachment ID) */
  sourceId: string;
  /** Source system (e.g., "jira", "github") */
  source: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Local file path where the attachment is stored */
  localPath: string;
  /** When the attachment was downloaded */
  downloadedAt: string;
  /** Original URL (for reference) */
  originalUrl?: string;
}

/** Options for downloading an attachment */
export interface DownloadOptions {
  /** Source system (e.g., "jira", "github") */
  source: string;
  /** Source attachment ID */
  sourceId: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Original URL (for reference) */
  originalUrl?: string;
}
