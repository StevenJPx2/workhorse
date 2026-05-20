// workhorse-core — main entry point

export * from "#config";
export { type WorkhorseContext, runWithContext, tryUseWorkhorse, useWorkhorse } from "#context";
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
  type DiscoveredLink,
  type HookEmitter,
  type HookEventMap,
  type HookMetadata,
  hooks,
  type PromptBuildingContext,
  type PromptContextBlock,
  registerHookMetadata,
  clearPluginHookMetadata,
  getAllHookMetadata,
  CORE_HOOK_METADATA,
  generateHooksMarkdown,
  generateHooksReference,
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
export { AgentAdapter, HarnessOrchestrator } from "#workflow/orchestrator";
export type {
  AdapterInfo,
  AgentState,
  CreateOptions,
  ImageContent,
  JSONSchema,
  ModelInfo,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "#workflow/orchestrator";
// Model registry exports for plugin authors
export { ModelRegistry } from "#workflow/orchestrator";
// Steering exports for plugin authors
export { SteeringRule } from "#workflow/orchestrator";
export type {
  SteeringCondition,
  SteeringRuleConfig,
  SteeringRuleConfigInput,
} from "#workflow/orchestrator";
// Tracker exports for plugin authors
export { Tracker } from "#workflow/tracker";
export type { IssueParserOptions } from "#workflow/tracker";
export type { IssueSource, IssueType, ParsedIssue } from "#workflow/tracker";
// Monitor exports for plugin authors
export {
  MonitorService,
  type EventMonitorOptions,
  type MonitorContext,
  type MonitorOptions,
  type MonitorResult,
  type MonitorStatus,
  type PollingMonitorOptions,
} from "#services/monitor";
// Attachment service exports
export {
  AttachmentService,
  type DownloadOptions,
  type StoredAttachment,
} from "#services/attachment";
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
export { deleteCredential, getCredential, storeCredential } from "#config";
// Auth exports for plugin authors
export type {
  ApiTokenAuthField,
  ApiTokenProvider,
  AuthProvider,
  AuthProviderType,
  AuthStatus,
  ExternalAuthConfig,
  ExternalProvider,
  NoAuthProvider,
  OAuthProvider,
  OAuthTokens,
} from "./auth/types.ts";
export {
  generateState,
  startOAuthFlow,
  type OAuthFlowError,
  type OAuthFlowResult,
  type OAuthResult,
} from "./auth";
export {
  bootstrap,
  type BootstrapOptions,
  type ProgressCallback,
  type Workhorse,
} from "./bootstrap.ts";
// Path validation exports for harness authors
export {
  assertPathAllowed,
  createPathValidator,
  isPathAllowed,
  type PathValidationOptions,
  type PathValidationResult,
  type PathValidator,
  validatePath,
} from "#lib/paths";
// Metadata footer for agent-generated content
export {
  isWorkhorseGenerated,
  METADATA_FOOTER,
  withWorkhorseFooter,
  WORKHORSE_MARKER,
} from "#lib/metadata-footer";
