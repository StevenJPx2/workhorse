/**
 * Tests for ticket key parsing utilities
 */

import { describe, expect, it } from "bun:test";
import {
  parseTicketKey,
  isValidTicketKey,
  extractTicketKey,
} from "./parse-ticket-key.ts";

describe("parse-ticket-key", () => {
  describe("parseTicketKey", () => {
    it("should parse bare ticket key", () => {
      const result = parseTicketKey("AM-123");
      expect(result.key).toBe("AM-123");
      expect(result.url).toBeUndefined();
    });

    it("should parse lowercase ticket key", () => {
      const result = parseTicketKey("am-456");
      expect(result.key).toBe("AM-456");
    });

    it("should parse ticket key with spaces", () => {
      const result = parseTicketKey("  AM-789  ");
      expect(result.key).toBe("AM-789");
    });

    it("should parse full Jira URL", () => {
      const result = parseTicketKey(
        "https://adeptmind.atlassian.net/browse/AM-123"
      );
      expect(result.key).toBe("AM-123");
      expect(result.url).toBe("https://adeptmind.atlassian.net/browse/AM-123");
    });

    it("should parse Jira URL with query params", () => {
      const result = parseTicketKey(
        "https://adeptmind.atlassian.net/browse/AM-123?atlOrigin=abc"
      );
      expect(result.key).toBe("AM-123");
      expect(result.url).toBe("https://adeptmind.atlassian.net/browse/AM-123");
    });

    it("should parse lowercase URL ticket key", () => {
      const result = parseTicketKey(
        "https://company.atlassian.net/browse/proj-999"
      );
      expect(result.key).toBe("PROJ-999");
    });

    it("should handle different project keys", () => {
      expect(parseTicketKey("JIRA-1").key).toBe("JIRA-1");
      expect(parseTicketKey("ABC-99999").key).toBe("ABC-99999");
      expect(parseTicketKey("XY-1").key).toBe("XY-1");
    });

    it("should return raw input for invalid format", () => {
      const result = parseTicketKey("not-a-ticket");
      expect(result.key).toBe("not-a-ticket");
    });

    it("should return raw input for invalid URL", () => {
      const result = parseTicketKey("https://example.com/other/path");
      expect(result.key).toBe("https://example.com/other/path");
    });
  });

  describe("isValidTicketKey", () => {
    it("should return true for valid keys", () => {
      expect(isValidTicketKey("AM-123")).toBe(true);
      expect(isValidTicketKey("JIRA-1")).toBe(true);
      expect(isValidTicketKey("ABC-99999")).toBe(true);
    });

    it("should return true for lowercase keys", () => {
      expect(isValidTicketKey("am-123")).toBe(true);
      expect(isValidTicketKey("jira-1")).toBe(true);
    });

    it("should return false for invalid formats", () => {
      expect(isValidTicketKey("")).toBe(false);
      expect(isValidTicketKey("123")).toBe(false);
      expect(isValidTicketKey("AM")).toBe(false);
      expect(isValidTicketKey("AM-")).toBe(false);
      expect(isValidTicketKey("-123")).toBe(false);
      expect(isValidTicketKey("AM123")).toBe(false);
      expect(isValidTicketKey("AM_123")).toBe(false);
      expect(isValidTicketKey("not a ticket")).toBe(false);
    });
  });

  describe("extractTicketKey", () => {
    it("should extract key from valid input", () => {
      expect(extractTicketKey("AM-123")).toBe("AM-123");
      expect(
        extractTicketKey("https://co.atlassian.net/browse/PROJ-456")
      ).toBe("PROJ-456");
    });

    it("should return empty string for invalid input", () => {
      expect(extractTicketKey("invalid")).toBe("");
      expect(extractTicketKey("")).toBe("");
      expect(extractTicketKey("just some text")).toBe("");
    });
  });
});
