import { describe, test, expect } from "bun:test";
import { parseTicketKey, isValidTicketKey, extractTicketKey } from "../parse-ticket-key.ts";

describe("parseTicketKey", () => {
  test("parses bare ticket key", () => {
    const result = parseTicketKey("AM-123");
    expect(result.key).toBe("AM-123");
    expect(result.url).toBeUndefined();
  });

  test("parses lowercase ticket key", () => {
    const result = parseTicketKey("am-123");
    expect(result.key).toBe("AM-123");
  });

  test("parses Jira URL", () => {
    const result = parseTicketKey("https://company.atlassian.net/browse/AM-123");
    expect(result.key).toBe("AM-123");
    expect(result.url).toBe("https://company.atlassian.net/browse/AM-123");
  });

  test("parses URL with query params", () => {
    const result = parseTicketKey("https://company.atlassian.net/browse/AM-123?atlOrigin=foo");
    expect(result.key).toBe("AM-123");
    expect(result.url).toBe("https://company.atlassian.net/browse/AM-123");
  });

  test("trims whitespace", () => {
    const result = parseTicketKey("  AM-123  ");
    expect(result.key).toBe("AM-123");
  });

  test("invalid input returns as-is", () => {
    const result = parseTicketKey("not-a-ticket");
    expect(result.key).toBe("not-a-ticket");
  });

  test("invalid URL falls back to key check", () => {
    const result = parseTicketKey("https://bad url");
    // Since it's not a valid URL or key, returns as-is
    expect(result.key).toBe("https://bad url");
  });
});

describe("isValidTicketKey", () => {
  test("valid key formats", () => {
    expect(isValidTicketKey("AM-123")).toBe(true);
    expect(isValidTicketKey("JIRA-1")).toBe(true);
    expect(isValidTicketKey("PROJECT-99999")).toBe(true);
  });

  test("invalid formats", () => {
    expect(isValidTicketKey("123")).toBe(false);
    expect(isValidTicketKey("AM")).toBe(false);
    expect(isValidTicketKey("AM-")).toBe(false);
    expect(isValidTicketKey("-123")).toBe(false);
    expect(isValidTicketKey("not-a-key")).toBe(false);
  });
});

describe("extractTicketKey", () => {
  test("extracts valid key from bare input", () => {
    expect(extractTicketKey("AM-123")).toBe("AM-123");
  });

  test("extracts key from URL", () => {
    expect(extractTicketKey("https://company.atlassian.net/browse/AM-123")).toBe("AM-123");
  });

  test("returns empty for invalid input", () => {
    expect(extractTicketKey("invalid")).toBe("");
    expect(extractTicketKey("")).toBe("");
  });
});
