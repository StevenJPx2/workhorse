// @jiratown/core — main entry point

export { bootstrap, type Jiratown } from "./bootstrap.ts";
export * from "#config";
export {
  // Database
  Database,
  // Tables
  issues,
  issueEvents,
  notifications,
  // Custom column types
  dateText,
  nullableDateText,
  // Zod schemas
  IssueStatusSchema,
  NotificationPrioritySchema,
  NotificationStatusSchema,
} from "#db";
export type {
  Issue,
  IssueStatus,
  IssueEvent,
  Notification,
  NotificationPriority,
  NotificationStatus,
} from "#db";
export {
  hooks,
  type HookEventMap,
  type PromptBuildingContext,
  type PromptContextBlock,
  type AgentInstance,
} from "#lib/hooks";
export { useJiratown, tryUseJiratown, runWithContext, type JiratownContext } from "#context";
export {
  definePlugin,
  PluginRegistry,
  PluginManifestSchema,
  PluginSymbol,
  isPlugin,
  type Plugin,
  type PluginOptions,
  type PluginManifest,
} from "#plugins";

// Memory service exports
export {
  MemoryService,
  L1Store,
  L2Store,
  NotificationService,
  generateSystemInbox,
  parseSessionMemory,
  serializeSessionMemory,
  // Types
  type CreateNotificationInput,
  type IssueEventType,
  type MemoryDocument,
  type MemoryDocumentType,
  type MemorySearchOptions,
  type SearchResult,
  type SessionEntry,
  type SessionMemory,
} from "#services/memory";
