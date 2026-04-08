/**
 * MCP Server exports
 */

export {
  createJiratownServer,
  getToolDefinitions,
  TOOL_NAMES,
  type ToolDefinition,
} from "./server.ts";

export type {
  GetNotificationsResponse,
  AcknowledgeInput,
  AcknowledgeResponse,
  EscalateInput,
  EscalateResponse,
  UpdateStatusInput,
  UpdateStatusResponse,
  JiratownToolContext,
} from "./types.ts";

export {
  handleGetNotifications,
  handleAcknowledge,
  handleUpdateStatus,
  handleEscalate,
} from "./tools/index.ts";
