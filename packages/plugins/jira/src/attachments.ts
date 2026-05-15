/**
 * Jira attachment handling - downloads attachments and rewrites ADF media references.
 *
 * Attachments are downloaded to ~/.local/share/workhorse/attachments/{repo}/{issueId}/
 * and media references in ADF are rewritten to point to local file paths.
 *
 * @module workhorse-plugin-jira/attachments
 */

import type { AttachmentService, StoredAttachment } from "workhorse-core";
import type { AtlassianClient } from "./client.ts";
import type { JiraAttachment } from "./types.ts";

/** Result of processing attachments for an issue */
export interface AttachmentProcessResult {
  /** Downloaded attachments */
  attachments: StoredAttachment[];
  /** Mapping from Jira attachment ID to local file path */
  idToPath: Map<string, string>;
}

/** Download all attachments for a Jira issue */
export async function downloadAttachments(
  client: AtlassianClient,
  attachmentService: AttachmentService,
  repoIdentifier: string,
  issueId: string,
  jiraAttachments: JiraAttachment[],
): Promise<AttachmentProcessResult> {
  const attachments: StoredAttachment[] = [];
  const idToPath = new Map<string, string>();

  for (const att of jiraAttachments) {
    // Skip if already downloaded
    const existingPath = await attachmentService.exists(repoIdentifier, issueId, att.id);
    if (existingPath) {
      idToPath.set(att.id, existingPath);
      continue;
    }

    // Download the attachment
    const content = await client.downloadAttachment(att.content);
    const stored = await attachmentService.store(repoIdentifier, issueId, content, {
      source: "jira",
      sourceId: att.id,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      originalUrl: att.content,
    });

    attachments.push(stored);
    idToPath.set(att.id, stored.localPath);
  }

  return { attachments, idToPath };
}

/**
 * Rewrite ADF content to replace Jira media IDs with local file paths.
 *
 * This traverses the ADF tree and replaces media node IDs with local paths,
 * allowing agents to reference the downloaded files directly.
 */
export function rewriteAdfMedia(adf: unknown, idToPath: Map<string, string>): unknown {
  if (adf === null || adf === undefined) return adf;
  if (typeof adf !== "object") return adf;

  if (Array.isArray(adf)) {
    return adf.map((item) => rewriteAdfMedia(item, idToPath));
  }

  const obj = adf as Record<string, unknown>;

  // Check if this is a media node
  if (obj.type === "media" && typeof obj.attrs === "object" && obj.attrs !== null) {
    const attrs = obj.attrs as Record<string, unknown>;
    const mediaId = attrs.id;

    if (typeof mediaId === "string" && idToPath.has(mediaId)) {
      // Rewrite to include local path
      return {
        ...obj,
        attrs: {
          ...attrs,
          localPath: idToPath.get(mediaId),
        },
      };
    }
  }

  // Recursively process all properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = rewriteAdfMedia(value, idToPath);
  }
  return result;
}

/**
 * Extract text from ADF and append attachment list with local paths.
 *
 * This is used to add attachment information to the plain text description
 * so agents know what files are available.
 */
export function appendAttachmentListToText(text: string, attachments: StoredAttachment[]): string {
  if (attachments.length === 0) return text;

  const attachmentLines = attachments.map(
    (att) => `- ${att.filename} (${att.mimeType}): ${att.localPath}`,
  );

  return `${text}\n\n## Attachments\n\n${attachmentLines.join("\n")}`;
}

/** Check if a MIME type is an image */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** Filter attachments to only images */
export function filterImageAttachments(attachments: JiraAttachment[]): JiraAttachment[] {
  return attachments.filter((att) => isImageMimeType(att.mimeType));
}

/** Media reference found in ADF content */
export interface AdfMediaRef {
  /** Media ID (corresponds to attachment ID) */
  id: string;
  /** Media type (file, image, etc) */
  type: string;
}

/**
 * Extract all media references from ADF content.
 *
 * This traverses ADF to find media nodes, which reference attachments.
 * Use this to detect which comments have embedded images/files.
 */
export function extractMediaRefsFromAdf(adf: unknown): AdfMediaRef[] {
  const refs: AdfMediaRef[] = [];

  function traverse(node: unknown): void {
    if (node === null || node === undefined || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    const obj = node as Record<string, unknown>;

    // Check if this is a media node
    if (obj.type === "media" && typeof obj.attrs === "object" && obj.attrs !== null) {
      const attrs = obj.attrs as Record<string, unknown>;
      if (typeof attrs.id === "string") {
        refs.push({
          id: attrs.id,
          type: typeof attrs.type === "string" ? attrs.type : "file",
        });
      }
    }

    // Recursively traverse all properties
    for (const value of Object.values(obj)) {
      traverse(value);
    }
  }

  traverse(adf);
  return refs;
}
