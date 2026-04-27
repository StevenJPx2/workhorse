// Main service export

// System inbox
export { generateSystemInbox } from "./inbox.ts";

// L1: Session memory store
export { L1Context, L1Store, parseSessionMemory, serializeSessionMemory } from "./l1/index.ts";

// L2: Semantic search store
export { L2Store } from "./l2.ts";

// Notifications
export { NotificationService } from "./notifications.ts";
export { MemoryService } from "./service.ts";

// Types
export type {
  CreateNotificationInput,
  IssueEventType,
  MemoryDocument,
  MemoryDocumentType,
  MemorySearchOptions,
  SearchResult,
  SessionEntry,
  SessionMemory,
} from "./types.ts";
