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
  type HookEmitter,
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
export type {
  AgentState,
  JSONSchema,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "#workflow/orchestrator";
// Steering exports for plugin authors
export { SteeringRule } from "#workflow/orchestrator";
export type {
  SteeringCondition,
  SteeringRuleConfig,
  SteeringRuleConfigInput,
} from "#workflow/orchestrator";
// Tracker exports for plugin authors
export type { IssueParserOptions } from "#workflow/tracker";
export type { IssueSource, IssueType, ParsedIssue } from "#workflow/tracker";
// Monitor exports for plugin authors
export type {
  MonitorContext,
  MonitorOptions,
  MonitorResult,
  MonitorStatus,
} from "#services/monitor";
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
// Config exports for plugin authors
export { getCredential, storeCredential } from "#config";
export { bootstrap, type BootstrapOptions, type Jiratown } from "./bootstrap.ts";
