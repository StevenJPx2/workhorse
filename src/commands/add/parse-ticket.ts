/**
 * Ticket key parsing utilities
 */

export interface ParsedTicket {
  key: string;
  url?: string;
}

/**
 * Parse a ticket key from input (handles both raw keys and URLs)
 *
 * Examples:
 *   "AM-123" -> { key: "AM-123" }
 *   "https://company.atlassian.net/browse/AM-123" -> { key: "AM-123", url: "..." }
 *   "https://company.atlassian.net/browse/AM-123?atlOrigin=..." -> { key: "AM-123", url: "..." }
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
        return {
          key: match[1].toUpperCase(),
          url: `${url.origin}/browse/${match[1].toUpperCase()}`,
        };
      }
    } catch {
      // Invalid URL, treat as key
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
 * Validate ticket key format
 */
export function isValidTicketKey(key: string): boolean {
  return /^[A-Z]+-\d+$/i.test(key);
}
