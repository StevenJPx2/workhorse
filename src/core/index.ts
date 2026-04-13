/* oxlint-disable max-lines-per-file */

/**
 * Jiratown Core SDK
 *
 * This is the public API for the Jiratown functional layer.
 * All business logic lives here - no UI dependencies.
 *
 * Usage:
 *   import { initDatabase, spawnAgent } from './core/index.ts';
 */

// oxlint-disable max-lines-per-file

// ========== Database ==========
export {
  // Connection
  initDatabase,
  getDatabase,
  closeDatabase,
  resetDatabaseRef,
  // Tickets
  insertTicket,
  getTicketById,
  getTicketsByRig,
  getAllTickets,
  updateTicketStatus,
  updateTicket,
  deleteTicket,
  // Events
  insertTicketEvent,
  getTicketEvents,
  // Migrations
  migrateTickets,
  migrateNotifications,
} from "./db/index.ts";

export type { Ticket, TicketStatus, TicketEvent, TicketEventType } from "#types/ticket.ts";

// ========== Configuration ==========
export {
  DEFAULT_CONFIG,
  getConfigPaths,
  ensureConfigDir,
  configExists,
  parseTomlFile,
  mergeConfigs,
  configToToml,
  loadConfig,
  saveGlobalConfig,
  saveProjectConfig,
  saveTheme,
} from "./config/index.ts";

export type { JiratownConfig, ResolvedConfig, AgentType, ThemeName } from "#types/config.ts";

// ========== Git / Rig Detection ==========
export { detectRig, getGitRoot, getRemoteUrl, normalizeRemoteUrl } from "./git/detect-rig.ts";

export type { RigInfo } from "./git/detect-rig.ts";

// ========== Session Management ==========
export {
  // Tmux
  createTmuxSessionName,
  buildTmuxCommand,
  parseTmuxList,
  isTmuxAvailable,
  createSession,
  listSessions,
  sessionExists,
  killSession,
  sendKeys,
  capturePane,
  // Worktree
  createWorktreePath,
  createBranchName,
  parseWorktreeList,
  buildGitCommand,
  createWorktree,
  listWorktrees,
  worktreeExists,
  getWorktree,
  removeWorktree,
  // Session Memory
  getContextPath,
  readSessionMemory,
  writeSessionMemory,
  formatSessionMemory,
  createSessionMemory,
  addSessionEvent,
  addKeyDecision,
  updateSessionStatus,
  hasSessionMemory,
} from "./session/index.ts";

export type { TmuxSession, Worktree, SessionMemory, SessionEvent } from "./session/index.ts";

// ========== Agent Orchestration ==========
export {
  // MCP Config
  getConfigDir,
  getConfigPath,
  generateMcpConfig,
  writeMcpConfig,
  removeMcpConfig,
  buildAgentCommand,
  // System Prompt
  generateSystemPrompt,
  generateInitialPrompt,
  // Orchestrator
  spawnAgent,
  stopAgent,
  checkAgentHealth,
  getAgent,
  getAllAgents,
  getAgentsByState,
  sendMessageToAgent,
  captureAgentOutput,
  // Discovery
  discoverAgents,
  discoverAgentByTicketId,
} from "./agent/orchestrator/index.ts";

export type {
  AgentState,
  AgentInstance,
  SpawnAgentOptions,
  SpawnResult,
  StopResult,
  HealthCheckResult,
  AgentMcpConfig,
  AgentSystemInstruction,
} from "./agent/orchestrator/index.ts";

// ========== Notifications ==========
export {
  initNotificationsTable,
  createNotification,
  getNotificationById,
  getNotificationBySource,
  getNotificationsByTicket,
  getUnreadNotifications,
  markNotificationRead,
  markNotificationAcknowledged,
  acknowledgeNotifications,
  deleteNotification,
  generateSystemInstruction,
} from "./notifications/index.ts";

export type {
  NotificationPriority,
  NotificationSourceType,
  NotificationStatus,
  Notification,
  CreateNotificationInput,
  NotificationFilters,
} from "./notifications/index.ts";

// ========== Pollers ==========
export { createJiraPoller, createGitHubPoller, createAgentPoller } from "./pollers/index.ts";

export type {
  PollerState,
  PollResult,
  BasePollerOptions,
  JiraPollerOptions,
  GitHubPollerOptions,
  AgentPollerOptions,
  JiraComment,
  JiraPollResult,
  GitHubReview,
  GitHubComment,
  GitHubPollResult,
  AgentPollResult,
  Poller,
} from "./pollers/index.ts";

// ========== MCP Server ==========
export {
  createJiratownServer,
  TOOL_NAMES,
  getToolDefinitions,
  handleGetNotifications,
  handleAcknowledge,
  handleUpdateStatus,
  handleEscalate,
} from "./mcp-server/index.ts";

export type {
  ToolDefinition,
  GetNotificationsResponse,
  AcknowledgeInput,
  AcknowledgeResponse,
  EscalateInput,
  EscalateResponse,
  UpdateStatusInput,
  UpdateStatusResponse,
  JiratownToolContext,
} from "./mcp-server/index.ts";

// ========== Utilities ==========
export { readClipboard, readClipboardSync } from "./clipboard.ts";

export {
  fuzzyMatch,
  fuzzyFilter,
  parseTicketKey,
  isValidTicketKey,
  extractTicketKey,
} from "./utils/index.ts";

export type { FuzzyMatch, ParsedTicket } from "./utils/index.ts";

// ========== Jira Client ==========
export { AtlassianClient, createAtlassianClient, mapIssueResponse } from "./jira/index.ts";

export type { JiraIssue, JiraClient, AtlassianClientOptions } from "./jira/index.ts";

// ========== Workflow ==========
export {
  launchTicketAgent,
  haltTicketAgent,
  restartTicketAgent,
  resumeAllTicketAgents,
  ACTIVE_TICKET_STATUSES,
} from "./workflow/index.ts";

export type {
  LaunchTicketAgentOptions,
  LaunchResult,
  HaltTicketAgentOptions,
  HaltResult,
  DatabaseOperations,
} from "./workflow/index.ts";

// ========== Notification Helpers ==========
export {
  countUnread,
  filterBlocking,
  markReadInList,
  acknowledgeInList,
  acknowledgeManyInList,
  removeFromList,
  filterByPriority,
  findNewNotifications,
} from "./notifications/index.ts";
