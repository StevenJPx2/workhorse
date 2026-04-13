/**
 * TicketInput component exports
 */

export { TicketInput } from "./ticket-input.tsx";
export { useTicketInput } from "./use-ticket-input.ts";

// Re-export from core for backward compatibility
export {
  parseTicketKey,
  isValidTicketKey,
  extractTicketKey,
  type ParsedTicket,
} from "#core/utils/index.ts";

export type { TicketInputProps, TicketInputState, UseTicketInputReturn } from "./types.ts";
