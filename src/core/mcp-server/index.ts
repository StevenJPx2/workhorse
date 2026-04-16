/**
 * MCP Server exports
 */

export { createJiratownServer } from "./server.ts";

export { TOOL_NAMES } from "./tool-names.ts";

export { getToolDefinitions, type ToolDefinition } from "./tool-definitions.ts";

export type {
  GetNotificationsResponse,
  AcknowledgeInput,
  AcknowledgeResponse,
  EscalateInput,
  EscalateResponse,
  UpdateStatusInput,
  UpdateStatusResponse,
  JiratownToolContext,
  OpenPRInput,
  OpenPRResponse,
  PRCreatedEvent,
  JiratownServerOptions,
} from "./types.ts";

export {
  handleGetNotifications,
  handleAcknowledge,
  handleUpdateStatus,
  handleEscalate,
} from "./tools/index.ts";
