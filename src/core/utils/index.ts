/**
 * Core utilities - Pure functions with no UI dependencies
 */

export { fuzzyMatch, fuzzyFilter, type FuzzyMatch } from "./fuzzy-match.ts";

export {
  parseTicketKey,
  isValidTicketKey,
  extractTicketKey,
  type ParsedTicket,
} from "./parse-ticket-key.ts";
