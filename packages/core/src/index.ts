// workhorse-core — main entry point

export * from "#config";
// Config exports for plugin authors
export { deleteCredential, getCredential, storeCredential } from "#config";
export {
  runWithContext,
  tryUseWorkhorse,
  useWorkhorse,
  type WorkhorseContext,
} from "#context";
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
  STATUSES as issueStatuses,
} from "#db";
// Path validation exports for harness authors
export {
  assertPathAllowed,
  CORE_HOOK_METADATA,
  clearPluginHookMetadata,
  createPathValidator,
  type DiscoveredLink,
  generateHooksMarkdown,
  generateHooksReference,
  getAllHookMetadata,
  type HookCallbacks,
  type HookEmitter,
  type HookEventMap,
  type HookMetadata,
  type HookPayload,
  hooks,
  isPathAllowed,
  // Metadata footer for agent-generated content
  isWorkhorseGenerated,
  METADATA_FOOTER,
  type PathValidationOptions,
  type PathValidationResult,
  type PathValidator,
  type PromptBuildingContext,
  type PromptContextBlock,
  registerHookMetadata,
  validatePath,
  WORKHORSE_MARKER,
  withWorkhorseFooter,
} from "#lib";
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
// Services exports for plugin authors
export {
  AttachmentService,
  type CreateNotificationInput,
  createRateLimitChecker,
  type DownloadOptions,
  type EventMonitorOptions,
  exponentialBackoff,
  extractRetryAfter,
  fixedPause,
  generateSystemInbox,
  type IssueEventType,
  L1Store,
  L2Store,
  type MemoryDocument,
  type MemoryDocumentType,
  type MemorySearchOptions,
  MemoryService,
  type MonitorContext,
  type MonitorOptions,
  type MonitorResult,
  MonitorService,
  type MonitorStatus,
  NotificationService,
  type PauseContext,
  type PauseDurationFn,
  type PollingMonitorOptions,
  parseRetryAfter,
  parseSessionMemory,
  type SearchResult,
  type SessionEntry,
  type SessionMemory,
  type StoredAttachment,
  serializeSessionMemory,
  withRetryAfterOrBackoff,
} from "#services";
// Workflow exports for plugin authors
export {
  type AdapterInfo,
  AgentAdapter,
  type AgentState,
  type CreateOptions,
  HarnessOrchestrator,
  type ImageContent,
  type IssueParserOptions,
  type IssueSource,
  type IssueType,
  type JSONSchema,
  type ModelInfo,
  ModelRegistry,
  type OrchestratorTool,
  type ParsedIssue,
  type SteeringCondition,
  SteeringRule,
  type SteeringRuleConfig,
  type SteeringRuleConfigInput,
  type ToolExecutionContext,
  type ToolResult,
  Tracker,
} from "#workflow";
export {
  generateState,
  type OAuthFlowError,
  type OAuthFlowResult,
  type OAuthResult,
  startOAuthFlow,
} from "./auth";
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
  type BootstrapOptions,
  bootstrap,
  type ProgressCallback,
  type Workhorse,
} from "./bootstrap.ts";
