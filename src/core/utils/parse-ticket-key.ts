/**
 * Ticket key parsing utilities
 *
 * Extracts Jira ticket keys from raw input (bare keys or URLs).
 * This is pure business logic with no UI dependencies.
 */

export interface ParsedTicket {
  /** Extracted ticket key (e.g., "AM-123") */
  key: string;
  /** Original URL if input was a URL */
  url?: string;
}

/**
 * Parse a ticket key from input
 *
 * Accepts:
 * - Bare ticket key: "AM-123"
 * - Full Jira URL: "https://company.atlassian.net/browse/AM-123"
 * - URL with query params: "https://company.atlassian.net/browse/AM-123?atlOrigin=..."
 *
 * @example
 * parseTicketKey("AM-123") // { key: "AM-123" }
 * parseTicketKey("https://co.atlassian.net/browse/AM-123") // { key: "AM-123", url: "..." }
 */
export function parseTicketKey(input: string): ParsedTicket {
  const trimmed = input.trim();

  // Check if it's a URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      // Extract ticket key from path (e.g., /browse/AM-123)
      const match = url.pathname.match(/\/browse\/([A-Z]+-\d+)/i);
      if (match) {
        const key = match[1].toUpperCase();
        return {
          key,
          url: `${url.origin}/browse/${key}`,
        };
      }
    } catch {
      // Invalid URL, fall through to key check
    }
  }

  // Check if it's a valid ticket key format
  const keyMatch = trimmed.match(/^([A-Z]+-\d+)$/i);
  if (keyMatch) {
    return { key: keyMatch[1].toUpperCase() };
  }

  // Return as-is (will fail validation later)
  return { key: trimmed };
}

/**
 * Validate that a string is a valid Jira ticket key format
 *
 * Format: PROJECT-NUMBER (e.g., "AM-123", "JIRA-456")
 */
export function isValidTicketKey(key: string): boolean {
  return /^[A-Z]+-\d+$/i.test(key);
}

/**
 * Extract ticket key from user input, returning empty string if invalid
 */
export function extractTicketKey(input: string): string {
  const { key } = parseTicketKey(input);
  return isValidTicketKey(key) ? key : "";
}
