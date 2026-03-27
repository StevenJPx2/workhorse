/**
 * Tests for ticket key parsing
 */

import { describe, expect, it } from "bun:test";
import { parseTicketKey, isValidTicketKey } from "./parse-ticket.ts";

describe("parse-ticket", () => {
  describe("parseTicketKey", () => {
    it("should parse simple ticket keys", () => {
      expect(parseTicketKey("AM-123")).toEqual({ key: "AM-123" });
      expect(parseTicketKey("JIRA-456")).toEqual({ key: "JIRA-456" });
      expect(parseTicketKey("PROJECT-1")).toEqual({ key: "PROJECT-1" });
    });

    it("should uppercase ticket keys", () => {
      expect(parseTicketKey("am-123")).toEqual({ key: "AM-123" });
      expect(parseTicketKey("Jira-456")).toEqual({ key: "JIRA-456" });
    });

    it("should trim whitespace", () => {
      expect(parseTicketKey("  AM-123  ")).toEqual({ key: "AM-123" });
    });

    it("should parse Jira URLs", () => {
      const result = parseTicketKey("https://company.atlassian.net/browse/AM-123");
      expect(result.key).toBe("AM-123");
      expect(result.url).toBe("https://company.atlassian.net/browse/AM-123");
    });

    it("should parse Jira URLs with query params", () => {
      const result = parseTicketKey(
        "https://company.atlassian.net/browse/AM-123?atlOrigin=some-value"
      );
      expect(result.key).toBe("AM-123");
      expect(result.url).toBe("https://company.atlassian.net/browse/AM-123");
    });

    it("should handle invalid input gracefully", () => {
      expect(parseTicketKey("invalid")).toEqual({ key: "invalid" });
      expect(parseTicketKey("123")).toEqual({ key: "123" });
    });

    it("should handle malformed URLs by treating as plain input", () => {
      // URL that throws in new URL() constructor
      const result = parseTicketKey("https://[invalid");
      expect(result.key).toBe("https://[invalid");
    });

    it("should handle URLs without /browse/ path", () => {
      // Valid URL but doesn't have /browse/TICKET pattern
      const result = parseTicketKey("https://company.atlassian.net/projects/AM");
      expect(result.key).toBe("https://company.atlassian.net/projects/AM");
    });
  });

  describe("isValidTicketKey", () => {
    it("should validate correct ticket keys", () => {
      expect(isValidTicketKey("AM-123")).toBe(true);
      expect(isValidTicketKey("JIRA-1")).toBe(true);
      expect(isValidTicketKey("PROJECT-99999")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(isValidTicketKey("am-123")).toBe(true);
      expect(isValidTicketKey("Am-123")).toBe(true);
    });

    it("should reject invalid ticket keys", () => {
      expect(isValidTicketKey("invalid")).toBe(false);
      expect(isValidTicketKey("123")).toBe(false);
      expect(isValidTicketKey("AM123")).toBe(false);
      expect(isValidTicketKey("AM-")).toBe(false);
      expect(isValidTicketKey("-123")).toBe(false);
    });
  });
});
