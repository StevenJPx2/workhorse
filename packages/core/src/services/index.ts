/**
 * Services barrel export
 * @module services
 */

// Attachment service
export {
  AttachmentService,
  type DownloadOptions,
  type StoredAttachment,
} from "./attachment/index.ts";

// Memory service
export {
  type CreateNotificationInput,
  generateSystemInbox,
  type IssueEventType,
  L1Store,
  L2Store,
  type MemoryDocument,
  type MemoryDocumentType,
  type MemorySearchOptions,
  MemoryService,
  NotificationService,
  parseSessionMemory,
  type SearchResult,
  type SessionEntry,
  type SessionMemory,
  serializeSessionMemory,
} from "./memory/index.ts";

// Monitor service
export {
  MonitorService,
  type EventMonitorOptions,
  type MonitorContext,
  type MonitorOptions,
  type MonitorResult,
  type MonitorStatus,
  type PollingMonitorOptions,
} from "./monitor/index.ts";
