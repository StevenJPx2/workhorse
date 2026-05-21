# Attachment Service

Centralized service for downloading and managing attachments from external issue trackers (Jira, GitHub, etc.), keeping them outside the repository to avoid accidental commits.

## Overview

AttachmentService provides a consistent way to download, store, and retrieve attachments from external sources. Files are stored in a central location organized by repository and issue.

| Feature               | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| **Storage Location**  | `~/.local/share/workhorse/attachments/{repo}/{issueId}/`                 |
| **Deduplication**     | Checks if attachment already downloaded before fetching                  |
| **Filename Format**   | `{sourceId}_{originalName}` (preserves original name with unique prefix) |
| **Supported Sources** | Jira (via plugin), extensible to GitHub, etc.                            |

## Architecture

```
~/.local/share/workhorse/attachments/
├── owner-repo/                    # Repository identifier (slashes → dashes)
│   ├── {issueId}/                # Internal issue UUID
│   │   ├── abc123_screenshot.png  # {sourceId}_{originalName}
│   │   ├── def456_mockup.jpg
│   │   └── ghi789_requirements.pdf
│   └── {anotherIssueId}/
└── another-repo/
```

## Usage

### Creating the Service

```typescript
import { AttachmentService } from "workhorse-core";
import { resolvePaths } from "workhorse-core";

const paths = resolvePaths();
const attachmentService = new AttachmentService(paths.attachmentsDir);
```

### Storing an Attachment

```typescript
// Download content from external source (plugin-specific)
const content: Buffer = await downloadFromJira(attachmentUrl);

// Store locally
const stored = await attachmentService.store(
  "owner/repo", // Repository identifier
  "issue-uuid-123", // Internal issue ID
  content, // File content as Buffer
  {
    source: "jira", // Source system
    sourceId: "att-456", // External attachment ID (for dedup)
    filename: "screenshot.png",
    mimeType: "image/png",
    size: 12345,
    originalUrl: "https://...", // Optional, for reference
  },
);

console.log(stored.localPath);
// ~/.local/share/workhorse/attachments/owner-repo/issue-uuid-123/att-456_screenshot.png
```

### Checking if Already Downloaded

```typescript
const existingPath = await attachmentService.exists(
  "owner/repo",
  "issue-uuid-123",
  "att-456", // sourceId
);

if (existingPath) {
  console.log("Already downloaded:", existingPath);
} else {
  // Download and store
}
```

### Listing Attachments for an Issue

```typescript
const attachments = await attachmentService.listForIssue(
  "owner/repo",
  "issue-uuid-123",
);

for (const att of attachments) {
  console.log(`${att.filename} (${att.mimeType}): ${att.localPath}`);
}
```

### Getting the Issue Directory

```typescript
const dir = attachmentService.getIssueDir("owner/repo", "issue-uuid-123");
// ~/.local/share/workhorse/attachments/owner-repo/issue-uuid-123
```

### Reading Attachment Content

```typescript
const content = await attachmentService.getContent(stored.localPath);
```

### Deleting Attachments

```typescript
// Delete a single attachment
await attachmentService.delete(stored.localPath);

// Delete all attachments for an issue
const count = await attachmentService.deleteForIssue(
  "owner/repo",
  "issue-uuid-123",
);
console.log(`Deleted ${count} attachments`);
```

## Types

### StoredAttachment

```typescript
interface StoredAttachment {
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
```

### DownloadOptions

```typescript
interface DownloadOptions {
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
```

## Plugin Integration

### Jira Plugin

The Jira plugin uses AttachmentService to handle:

1. **Issue-level attachments** — Files attached directly to Jira issues
2. **Comment media** — Images/files embedded in comment ADF (Atlassian Document Format)

```typescript
// In jira plugin setup
import { AttachmentService } from "workhorse-core";

const attachmentService = new AttachmentService(ctx.paths.attachmentsDir);

// Download issue attachments
const jiraAttachments = await client.getAttachments(issueKey);
for (const att of jiraAttachments) {
  const content = await client.downloadAttachment(att.content);
  await attachmentService.store(repoId, issueId, content, {
    source: "jira",
    sourceId: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
    originalUrl: att.content,
  });
}
```

### Agent Tool: `jira_get_attachments`

Agents can use this tool to download and access attachments:

```json
{
  "attachments": [
    {
      "filename": "screenshot.png",
      "mimeType": "image/png",
      "size": 12345,
      "localPath": "~/.local/share/workhorse/attachments/owner-repo/uuid/abc_screenshot.png"
    }
  ],
  "commentMedia": [
    {
      "commentId": "12345",
      "author": "John Doe",
      "mediaCount": 2,
      "mediaIds": ["media-1", "media-2"]
    }
  ],
  "directory": "~/.local/share/workhorse/attachments/owner-repo/uuid",
  "total": 3
}
```

## Design Decisions

### Why Store Outside Repository?

1. **Avoid accidental commits** — Attachments (especially screenshots) can be large and shouldn't pollute git history
2. **Consistent location** — Agents know where to find attachments regardless of worktree location
3. **Cross-session persistence** — Attachments survive worktree cleanup

### Filename Format: `{sourceId}_{originalName}`

- **Unique prefix** — Prevents collisions when multiple attachments have the same name
- **Underscore separator** — Handles attachment IDs that may contain hyphens
- **Original name preserved** — Agents can understand the file's purpose from the filename

### Deduplication via `exists()`

Before downloading, plugins should check if an attachment already exists. This:

- Avoids redundant downloads
- Speeds up repeated tool calls
- Preserves bandwidth

## Files

| File         | Purpose                                      |
| ------------ | -------------------------------------------- |
| `service.ts` | AttachmentService class implementation       |
| `types.ts`   | StoredAttachment, DownloadOptions interfaces |
| `index.ts`   | Barrel exports                               |
