// workhorse-core — main entry point

export * from "#config";
export {
  type WorkhorseContext,
  runWithContext,
  tryUseWorkhorse,
  useWorkhorse,
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
} from "#db";
export {
  type DiscoveredLink,
  type HookCallbacks,
  type HookEmitter,
  type HookEventMap,
  type HookMetadata,
  type HookPayload,
  hooks,
  type PromptBuildingContext,
  type PromptContextBlock,
  registerHookMetadata,
  clearPluginHookMetadata,
  getAllHookMetadata,
  CORE_HOOK_METADATA,
  generateHooksMarkdown,
  generateHooksReference,
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
// Workflow exports for plugin authors
export {
  AgentAdapter,
  HarnessOrchestrator,
  ModelRegistry,
  SteeringRule,
  Tracker,
  type AdapterInfo,
  type AgentState,
  type CreateOptions,
  type ImageContent,
  type IssueParserOptions,
  type IssueSource,
  type IssueType,
  type JSONSchema,
  type ModelInfo,
  type OrchestratorTool,
  type ParsedIssue,
  type SteeringCondition,
  type SteeringRuleConfig,
  type SteeringRuleConfigInput,
  type ToolExecutionContext,
  type ToolResult,
} from "#workflow";
// Services exports for plugin authors
export {
  AttachmentService,
  L1Store,
  L2Store,
  MemoryService,
  MonitorService,
  NotificationService,
  createRateLimitChecker,
  exponentialBackoff,
  extractRetryAfter,
  fixedPause,
  generateSystemInbox,
  parseRetryAfter,
  parseSessionMemory,
  serializeSessionMemory,
  withRetryAfterOrBackoff,
  type CreateNotificationInput,
  type DownloadOptions,
  type EventMonitorOptions,
  type IssueEventType,
  type MemoryDocument,
  type MemoryDocumentType,
  type MemorySearchOptions,
  type MonitorContext,
  type MonitorOptions,
  type MonitorResult,
  type MonitorStatus,
  type PauseContext,
  type PauseDurationFn,
  type PollingMonitorOptions,
  type SearchResult,
  type SessionEntry,
  type SessionMemory,
  type StoredAttachment,
} from "#services";
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
  // Metadata footer for agent-generated content
  isWorkhorseGenerated,
  METADATA_FOOTER,
  withWorkhorseFooter,
  WORKHORSE_MARKER,
} from "#lib";
