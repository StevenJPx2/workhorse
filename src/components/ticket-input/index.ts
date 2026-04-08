/**
 * TicketInput component exports
 */

export { TicketInput } from "./ticket-input.tsx";
export { useTicketInput } from "./use-ticket-input.ts";
export {
  parseTicketKey,
  isValidTicketKey,
  extractTicketKey,
  type ParsedTicket,
} from "./parse-ticket-key.ts";
export type {
  TicketInputProps,
  TicketInputState,
  UseTicketInputReturn,
} from "./types.ts";
