// @jiratown/core — main entry point

export * from "#config";
export { type JiratownContext, runWithContext, tryUseJiratown, useJiratown } from "#context";
export type {
  Issue,
  IssueEvent,
  IssueStatus,
  Notification,
  NotificationPriority,
  NotificationStatus,
} from "#db";
export {
  // Database
  Database,
  // Custom column types
  dateText,
  // Zod schemas
  IssueStatusSchema,
  issueEvents,
  // Tables
  issues,
  NotificationPrioritySchema,
  NotificationStatusSchema,
  notifications,
  nullableDateText,
} from "#db";
export {
  type HookEventMap,
  hooks,
  type PromptBuildingContext,
  type PromptContextBlock,
} from "#lib/hooks";
export {
  definePlugin,
  isPlugin,
  type Plugin,
  type PluginManifest,
  PluginManifestSchema,
  type PluginOptions,
  PluginRegistry,
  PluginSymbol,
} from "#plugins";
// Orchestrator exports for plugin authors
export { AgentAdapter } from "#workflow/orchestrator";
// Memory service exports
export {
  // Types
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
} from "#services/memory";
export { bootstrap, type Jiratown } from "./bootstrap.ts";
